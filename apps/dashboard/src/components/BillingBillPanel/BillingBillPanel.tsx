'use client';

import { App, Button, Checkbox, Modal, InputNumber, Select, Space, Tooltip } from 'antd';
import {
  UserPlus,
  Receipt,
  Printer,
  Bluetooth,
  Banknote,
  CreditCard,
  Smartphone,
  Split,
  Plus,
  X,
  Pencil,
  CalendarClock,
  ShoppingBag,
  Info,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CustomerFormValues } from '../CustomerDetails';
import CustomerSelector from '../CustomerDetails/CustomerSelector';
import { useShop } from '@/contexts/ShopContext';
import { apiFetch } from '@/lib/api';
import {
  makeInvoiceNo,
  buildPrintReceiptHtml,
  orderIdToInvoiceRef,
  type PrintInvoiceInput,
} from '@/lib/printInvoice';
import {
  allowedInstantDisplayUnits,
  sizeLabel,
  billDisplayUnitPrice,
  billLineSubtotal,
  billPrintQuantity,
} from '@/lib/billingInstantPricing';
import { ProductLineThumb } from '@/components/ProductLineThumb/ProductLineThumb';
import {
  PAYMENT_LEG_METHODS,
  paymentLabel,
  planCheckoutPayment,
  roundRupees,
  type PaymentLeg,
  type PaymentLegMethod,
  type PosPaymentMode,
  type SplitRow,
} from '@/lib/payments';
import {
  isNativeUsbPrinterAvailable,
  printBillViaNativeAndroid,
  type NativeAndroidBillPayload,
} from '@/lib/usbPrinter';
import {
  buildPlainTextReceiptForRawBt,
  isLikelyAndroidForRawBt,
  launchRawBtPrintFromBill,
  THERMAL_POWERED_BY_LINE,
} from '@/lib/rawBtPrint';

/** Date -> value string for <input type="datetime-local"> (local time, no tz). */
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Human-readable label for a chosen backdate. */
function formatSaleDateTime(d: Date): string {
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export interface BillItem {
  lineId: string;
  variantId: string;
  productId: string;
  name: string;
  variantLabel: string;
  barcode: string;
  catalogUnitPrice: number;
  stockUnitsToDeduct: number;
  displayQuantity: number;
  displayUnit: string;
  inventoryUnit: string;
  imageUrl?: string | null;
  isInstant?: boolean;
  /**
   * Instant line whose quantity or unit the cashier has set by hand. Untouched instant
   * lines absorb repeat "Add" clicks; edited ones stay separate (e.g. 250 g and 400 g).
   */
  instantEdited?: boolean;
  /** Manual line: not tied to catalog; checkout prints only (no order / stock). */
  isRaw?: boolean;
  /** Stock on hand (inventory unit) when the line was added; used to warn before checkout. */
  availableStock?: number;
}

export type BillingBillPanelLayout = 'sidebar' | 'drawer';

export type PosPaymentMethod = PosPaymentMode;

const DEFAULT_SPLIT_ROWS: SplitRow[] = [
  { method: 'CASH', amount: null },
  { method: 'UPI', amount: null },
];

export type BillingCustomerBinding = {
  customer: CustomerFormValues | null;
  setCustomer: (value: CustomerFormValues | null) => void;
  detailsOpen: boolean;
  setDetailsOpen: (open: boolean) => void;
};

export type BillingPosCheckoutPrintMode = 'browser' | 'thermal' | 'rawbt';

/** Exposes the same checkout actions as the sale panel (for Raw tab quick actions). */
export type BillingPosCheckoutApi = {
  printBrowser: () => void;
  printThermal: () => void;
  printRawBt: () => void;
  busy: boolean;
  busyMode: BillingPosCheckoutPrintMode | null;
  canPrint: boolean;
  showUsbThermal: boolean;
};

export interface BillingBillPanelProps {
  items: BillItem[];
  onQuantityChange: (lineId: string, delta: number) => void;
  onRemove: (lineId: string) => void;
  onInstantLineUpdate?: (
    lineId: string,
    next: { displayQuantity: number; displayUnit: string },
  ) => void;
  onSaleComplete?: () => void;
  orderId?: string;
  layout?: BillingBillPanelLayout;
  className?: string;
  customerBinding?: BillingCustomerBinding;
  hideAddCustomerInPanel?: boolean;
  /** Register checkout handlers (e.g. Raw billing tab duplicate buttons). */
  onCheckoutApi?: (api: BillingPosCheckoutApi | null) => void;
}

/** Totals the API stored for a saved sale (POST /orders/pos response). */
type SavedBill = {
  totalAmount?: number;
  tax?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  discount?: number;
  createdAt?: string;
  paymentMethod?: string;
  payments?: PaymentLeg[];
  cashTendered?: number | null;
  changeDue?: number | null;
};

export function BillingBillPanel({
  items,
  onQuantityChange,
  onRemove,
  onInstantLineUpdate,
  onSaleComplete,
  orderId = '-',
  layout = 'sidebar',
  className = '',
  customerBinding,
  hideAddCustomerInPanel = false,
  onCheckoutApi,
}: BillingBillPanelProps) {
  const { message } = App.useApp();
  const { shops, effectiveShopCode } = useShop();
  const currentShop = useMemo(
    () => shops.find((s) => s.shopCode === effectiveShopCode),
    [shops, effectiveShopCode],
  );

  const shopName = currentShop?.name ?? 'Calcutta Sweets';
  const cgstRate = currentShop?.cgstRate ?? 2.5;
  const sgstRate = currentShop?.sgstRate ?? 2.5;
  const totalTaxRate = (cgstRate + sgstRate) / 100;

  const itemsGrossTotal = items.reduce(
    (sum, i) =>
      sum + billLineSubtotal(i.stockUnitsToDeduct, i.catalogUnitPrice),
    0,
  );

  // Stock on hand for each variant whose lines together ask for more than that. The API
  // still decides at checkout; this only warns the cashier before they take payment.
  const shortStock = new Map<string, number>();
  {
    const wanted = new Map<string, number>();
    for (const i of items) {
      if (i.isRaw || i.availableStock == null) continue;
      wanted.set(i.variantId, (wanted.get(i.variantId) ?? 0) + i.stockUnitsToDeduct);
    }
    for (const i of items) {
      const w = wanted.get(i.variantId);
      if (w != null && i.availableStock != null && w > i.availableStock) {
        shortStock.set(i.variantId, i.availableStock);
      }
    }
  }

  const [discount, setDiscount] = useState(0);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [tempDiscount, setTempDiscount] = useState(0);
  const [showGstinOnBill, setShowGstinOnBill] = useState(true);

  // Optional backdated sale time. null => use current time at checkout.
  const [saleDateTime, setSaleDateTime] = useState<Date | null>(null);
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [tempSaleDateTime, setTempSaleDateTime] = useState('');

  const total = itemsGrossTotal - discount;

  const gstAmount = total * (totalTaxRate / (1 + totalTaxRate));
  const cgstAmount = total * ((cgstRate / 100) / (1 + totalTaxRate));
  const sgstAmount = total * ((sgstRate / 100) / (1 + totalTaxRate));

  const shopAddressPrint = useMemo(() => {
    if (!currentShop) return null;
    const addr = currentShop.address?.trim() ?? '';
    const cityState = [currentShop.city, currentShop.state]
      .filter(Boolean)
      .join(', ');
    const pin = currentShop.pincode?.trim() ?? '';
    const a = addr.toLowerCase();
    const stateLc = (currentShop.state ?? '').trim().toLowerCase();
    const cityLc = (currentShop.city ?? '').trim().toLowerCase();
    const hasStateInAddr = stateLc.length > 0 && a.includes(stateLc);
    const hasCityStateInAddr =
      cityLc.length > 0 &&
      stateLc.length > 0 &&
      a.includes(cityLc) &&
      a.includes(stateLc);
    const addrHasRaipurCg = /\bRaipur\s*\(\s*C\.G\s*\)/i.test(addr);
    const cityStateDuplicatesCgBlock =
      addrHasRaipurCg &&
      cityLc === 'raipur' &&
      stateLc === 'chhattisgarh';
    const extraLocality =
      cityState &&
      !cityStateDuplicatesCgBlock &&
      !hasCityStateInAddr &&
      !(hasStateInAddr && a.includes(cityLc));
    const parts = [
      addr || undefined,
      extraLocality ? cityState : undefined,
      pin || undefined,
    ].filter(Boolean) as string[];
    return parts.length ? parts.join(', ') : null;
  }, [currentShop]);

  const [internalDetailsOpen, setInternalDetailsOpen] = useState(false);
  const [internalCustomer, setInternalCustomer] =
    useState<CustomerFormValues | null>(null);
  const customer = customerBinding?.customer ?? internalCustomer;
  const setCustomer = customerBinding?.setCustomer ?? setInternalCustomer;
  const detailsOpen = customerBinding?.detailsOpen ?? internalDetailsOpen;
  const setDetailsOpen = customerBinding?.setDetailsOpen ?? setInternalDetailsOpen;
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod | null>(
    null,
  );
  /** Cash handed over (Cash mode, or the cash leg of a split). null = exact. */
  const [cashReceived, setCashReceived] = useState<number | null>(null);
  const [splitRows, setSplitRows] = useState<SplitRow[]>(DEFAULT_SPLIT_ROWS);

  // Discount and payment choice survive leaving the POS page and the sidebar/drawer swap,
  // alongside the cart draft (same key prefix, so logout clears them together).
  const checkoutDraftKey = `calcutta_pos_draft:${effectiveShopCode}:checkout`;
  const [checkoutDraftShop, setCheckoutDraftShop] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveShopCode || checkoutDraftShop === effectiveShopCode) return;
    try {
      const raw = sessionStorage.getItem(checkoutDraftKey);
      const draft = raw
        ? (JSON.parse(raw) as {
            discount?: number;
            paymentMethod?: PosPaymentMethod | null;
            cashReceived?: number | null;
            splitRows?: SplitRow[];
          })
        : null;
      if (typeof draft?.discount === 'number') setDiscount(draft.discount);
      if (draft?.paymentMethod) setPaymentMethod(draft.paymentMethod);
      if (typeof draft?.cashReceived === 'number') setCashReceived(draft.cashReceived);
      if (Array.isArray(draft?.splitRows) && draft.splitRows.length > 0) {
        setSplitRows(draft.splitRows);
      }
    } catch {
      // Storage blocked or draft unreadable: start from the defaults.
    }
    setCheckoutDraftShop(effectiveShopCode);
  }, [effectiveShopCode, checkoutDraftKey, checkoutDraftShop]);

  useEffect(() => {
    if (!effectiveShopCode || checkoutDraftShop !== effectiveShopCode) return;
    try {
      const untouched =
        discount === 0 &&
        paymentMethod == null &&
        cashReceived == null &&
        splitRows === DEFAULT_SPLIT_ROWS;
      if (untouched) sessionStorage.removeItem(checkoutDraftKey);
      else {
        sessionStorage.setItem(
          checkoutDraftKey,
          JSON.stringify({ discount, paymentMethod, cashReceived, splitRows }),
        );
      }
    } catch {
      // Storage full or blocked: checkout still works, it just won't survive navigation.
    }
  }, [
    effectiveShopCode,
    checkoutDraftKey,
    checkoutDraftShop,
    discount,
    paymentMethod,
    cashReceived,
    splitRows,
  ]);

  // Emptying the cart by hand ends that sale, so its discount and payment choice go too;
  // otherwise the next sale would silently start with them. Only the drop from some lines
  // to none counts, so the first render (before a saved cart is restored) is left alone.
  const prevItemCountRef = useRef(items.length);
  useEffect(() => {
    if (prevItemCountRef.current > 0 && items.length === 0) {
      setDiscount(0);
      setPaymentMethod(null);
      setCashReceived(null);
      setSplitRows(DEFAULT_SPLIT_ROWS);
    }
    prevItemCountRef.current = items.length;
  }, [items.length]);

  const payment = useMemo(
    () =>
      planCheckoutPayment(paymentMethod, roundRupees(total), cashReceived, splitRows),
    [paymentMethod, total, cashReceived, splitRows],
  );
  const splitHasCash = splitRows.some((r) => r.method === 'CASH');

  const selectPaymentMode = (mode: PosPaymentMethod) => {
    setPaymentMethod(mode);
    setCashReceived(null);
    if (mode === 'SPLIT') setSplitRows(DEFAULT_SPLIT_ROWS);
  };
  const updateSplitRow = (index: number, next: Partial<SplitRow>) =>
    setSplitRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...next } : r)));
  const addSplitRow = () =>
    setSplitRows((rows) => {
      const free = PAYMENT_LEG_METHODS.find((m) => !rows.some((r) => r.method === m));
      return free && rows.length < 3 ? [...rows, { method: free, amount: null }] : rows;
    });
  const removeSplitRow = (index: number) => {
    if (splitRows[index]?.method === 'CASH') setCashReceived(null);
    setSplitRows((rows) => rows.filter((_, i) => i !== index));
  };

  /** Payment details to print: the server's stored legs, else what the cashier entered. */
  const printedPayment = (saved?: SavedBill) => {
    const mode = saved?.paymentMethod ?? paymentMethod ?? 'CASH';
    return {
      paymentMode: paymentLabel(mode, 'Cash'),
      payments:
        saved?.payments ??
        payment.payments ??
        (mode !== 'SPLIT' ? [{ method: mode, amount: saved?.totalAmount ?? total }] : []),
      cashTendered: saved?.cashTendered ?? payment.cashTendered ?? null,
      changeDue: saved?.changeDue ?? (payment.change > 0 ? payment.change : null),
    };
  };
  const [checkoutBusyMode, setCheckoutBusyMode] = useState<
    BillingPosCheckoutPrintMode | null
  >(null);
  const checkoutBusy = checkoutBusyMode !== null;

  const [receiptPreviewHtml, setReceiptPreviewHtml] = useState<string | null>(
    null,
  );
  const receiptIframeRef = useRef<HTMLIFrameElement | null>(null);
  const lineCount = items.length;

  const buildNativeAndroidBill = (
    billNo: string,
    saved?: SavedBill,
  ): NativeAndroidBillPayload => {
    // Print what the server stored (it prices and taxes the bill); fall back to the
    // cart's own figures only if the save response is missing them.
    const billTotal = saved?.totalAmount ?? total;
    const billTax = saved?.tax ?? gstAmount;
    const billCgst = saved?.cgstAmount ?? cgstAmount;
    const billSgst = saved?.sgstAmount ?? sgstAmount;
    const billDiscount = saved?.discount ?? discount;
    const billIssuedAt = saved?.createdAt ?? (saleDateTime ?? new Date()).toISOString();
    const fallbackAddress = [currentShop?.city, currentShop?.state]
      .filter(Boolean)
      .join(', ');
    const address = shopAddressPrint?.trim() || fallbackAddress || '';

    const customerName = customer?.name?.trim() ?? '';
    const customerPhone = customer?.phone?.trim() ?? '';
    const customerGstinVal = customer?.gstin?.trim() ?? '';
    const showCustomerGstin = customerGstinVal.length > 0;

    const taxableBase = Math.max(0, billTotal - billTax);

    const base: NativeAndroidBillPayload = {
      shopName,
      shopAddress: address,
      shopPhone: currentShop?.phone?.trim() ?? '',
      gstin: currentShop?.gstNumber?.trim() ?? '',
      showShopGstin: showGstinOnBill,
      fssaiNumber: currentShop?.fssaiNumber?.trim() ?? '',
      billNumber: billNo,
      billTitle: 'TAX INVOICE',
      billerName: '',
      customerName,
      customerPhone,
      customerGstin: customerGstinVal,
      showCustomerGstin,
      items: items.map((i) => {
        const printed = billPrintQuantity(i.displayQuantity, i.displayUnit);
        const rate = billDisplayUnitPrice(
          i.stockUnitsToDeduct,
          i.catalogUnitPrice,
          printed.quantity,
        );
        const amount = billLineSubtotal(
          i.stockUnitsToDeduct,
          i.catalogUnitPrice,
        );
        const name =
          i.variantLabel && i.variantLabel !== 'Regular'
            ? `${i.name} (${i.variantLabel})`
            : i.name;
        return { name, qty: printed.quantity, rate, amount, discount: 0 };
      }),
      taxableBase,
      subtotal: taxableBase,
      discount: billDiscount,
      tax: billTax,
      taxLabel: `GST ${(cgstRate + sgstRate).toFixed(1)}%`,
      cgstPercent: cgstRate,
      sgstPercent: sgstRate,
      cgstAmount: billCgst,
      sgstAmount: billSgst,
      total: billTotal,
      ...(() => {
        const pay = printedPayment(saved);
        return {
          paymentMode: pay.paymentMode,
          amountPaid: billTotal,
          payments: pay.payments.map((p) => ({
            mode: paymentLabel(p.method, 'Cash'),
            amount: p.amount,
          })),
          ...((pay.changeDue ?? 0) > 0.005 && pay.cashTendered != null
            ? { cashTendered: pay.cashTendered, changeDue: pay.changeDue ?? 0 }
            : {}),
        };
      })(),
      footerMessage: 'Thank You. Come Again!',
      footerNote: '* Tax not payable on reverse charge basis',
      bankAccountNumber: currentShop?.bankAccountNumber?.trim() ?? '',
      bankIfsc: currentShop?.bankIfsc?.trim() ?? '',
      poweredBy: THERMAL_POWERED_BY_LINE,
      issuedAt: billIssuedAt,
    };
    return {
      ...base,
      thermalPlainText: buildPlainTextReceiptForRawBt(base),
    };
  };

  const buildPrintInvoiceInput = (
    invoiceNo: string,
    saved?: SavedBill,
  ): PrintInvoiceInput => {
    // Print what the server stored (it prices and taxes the bill); fall back to the
    // cart's own figures only if the save response is missing them.
    const billTotal = saved?.totalAmount ?? total;
    const billTax = saved?.tax ?? gstAmount;
    const billCgst = saved?.cgstAmount ?? cgstAmount;
    const billSgst = saved?.sgstAmount ?? sgstAmount;
    const billDiscount = saved?.discount ?? discount;
    const billIssuedAt = saved?.createdAt ?? (saleDateTime ?? new Date()).toISOString();
    const taxableBase = Math.max(0, billTotal - billTax);

    return {
      shopName,
      shopCode: effectiveShopCode || '-',
      shopAddress: shopAddressPrint,
      shopPhone: currentShop?.phone ?? null,
      gstNumber: currentShop?.gstNumber ?? null,
      fssaiNumber: currentShop?.fssaiNumber ?? null,
      showGstinOnBill: showGstinOnBill,
      invoiceNo,
      issuedAt: billIssuedAt,
      customer,
      lines: items.map((i) => {
        const printed = billPrintQuantity(i.displayQuantity, i.displayUnit);
        return {
          name: i.name,
          variantLabel: i.variantLabel,
          barcode: i.barcode,
          quantity: printed.quantity,
          unit: printed.unit,
          unitPrice: billDisplayUnitPrice(
            i.stockUnitsToDeduct,
            i.catalogUnitPrice,
            printed.quantity,
          ),
        };
      }),
      subtotal: taxableBase,
      gstRate: totalTaxRate,
      gstAmount: billTax,
      cgstPercent: cgstRate,
      sgstPercent: sgstRate,
      cgstAmountSplit: billCgst,
      sgstAmountSplit: billSgst,
      discount: billDiscount,
      total: billTotal,
      returnHref:
        typeof window !== 'undefined'
          ? `${window.location.origin}/billing-pos`
          : null,
      bankAccountNumber: currentShop?.bankAccountNumber ?? null,
      bankIfsc: currentShop?.bankIfsc ?? null,
      ...printedPayment(saved),
    };
  };

  type CheckoutPrintMode = 'browser' | 'thermal' | 'rawbt';

  const completeCheckoutRef = useRef<
    (printMode: CheckoutPrintMode) => Promise<void>
  >(async () => {});

  const completeCheckout = async (printMode: CheckoutPrintMode) => {
    if (items.length === 0) {
      message.warning('Add at least one item before generating a bill.');
      return;
    }
    if (!paymentMethod) {
      message.warning('Select a payment mode (Cash, UPI, Card or Split) first.');
      return;
    }
    if (!payment.ready) {
      message.warning(payment.blocker ?? 'Payment does not match the bill total.');
      return;
    }
    const hasRaw = items.some((i) => i.isRaw);
    const hasCatalog = items.some((i) => !i.isRaw);
    const allRaw = hasRaw && !hasCatalog;

    if (printMode === 'thermal' && !isNativeUsbPrinterAvailable()) {
      message.error(
        'USB thermal printing is only available inside the Calcutta Sweets Android POS app.',
      );
      return;
    }

    if (printMode === 'rawbt' && !isLikelyAndroidForRawBt()) {
      message.warning(
        'Print via RawBT only works on Android (tablet/phone) with the RawBT app. On Mac or Windows use Generate bill, or open this site on your Android device.',
      );
      return;
    }



    setCheckoutBusyMode(printMode);
    try {
      const res = await apiFetch('/orders/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod,
          // Single mode: the server charges its own total. Split: legs must add up to it.
          ...(payment.payments ? { payments: payment.payments } : {}),
          ...(payment.cashTendered != null ? { cashTendered: payment.cashTendered } : {}),
          discount,
          createdAt: saleDateTime ? saleDateTime.toISOString() : undefined,
          customerName: customer?.name || undefined,
          customerPhone: customer?.phone,
          customerEmail: customer?.email,
          customerAddress: customer?.address,
          customerNotes: customer?.notes,
          customerGstin: customer?.gstin,
          items: items.map((i) => ({
            variantId: i.isRaw ? undefined : i.variantId,
            customName: i.isRaw ? i.name : undefined,
            quantity: i.stockUnitsToDeduct,
            unitPrice: i.catalogUnitPrice,
            ...(i.isInstant || i.isRaw
              ? {
                  displayQuantity: i.displayQuantity,
                  displayUnit: i.displayUnit,
                }
              : {}),
          })),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(
          typeof payload?.message === 'string'
            ? payload.message
            : Array.isArray(payload?.message)
              ? payload.message.join(', ')
              : 'Could not save this sale. Check stock and try again.',
        );
        return;
      }
      const saved = payload as SavedBill & { id: string; billNo?: string | null };
      const invoiceNo = saved.billNo || orderIdToInvoiceRef(saved.id);
      if (printMode === 'browser') {
        setReceiptPreviewHtml(
          buildPrintReceiptHtml(buildPrintInvoiceInput(invoiceNo, saved), {
            inlinePreview: true,
          }),
        );
        message.success('Sale saved. Review the receipt, then print or close.');
      } else if (printMode === 'thermal') {
        await printBillViaNativeAndroid(buildNativeAndroidBill(invoiceNo, saved));
        message.success('Bill saved and sent to USB thermal printer.');
      } else {
        const r = launchRawBtPrintFromBill(buildNativeAndroidBill(invoiceNo, saved));
        if (!r.ok) {
          message.error(r.error);
          return;
        }
        message.success('Bill saved. Opening RawBT…');
      }
      setPaymentMethod(null);
      setCashReceived(null);
      setSplitRows(DEFAULT_SPLIT_ROWS);
      setDiscount(0);
      setSaleDateTime(null);
      onSaleComplete?.();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : 'Network error while saving the sale.',
      );
    } finally {
      setCheckoutBusyMode(null);
    }
  };

  completeCheckoutRef.current = completeCheckout;

  useEffect(() => {
    if (!onCheckoutApi) return;
    onCheckoutApi({
      printBrowser: () => {
        void completeCheckoutRef.current('browser');
      },
      printThermal: () => {
        void completeCheckoutRef.current('thermal');
      },
      printRawBt: () => {
        void completeCheckoutRef.current('rawbt');
      },
      busy: checkoutBusy,
      busyMode: checkoutBusyMode,
      canPrint: lineCount > 0 && payment.ready,
      showUsbThermal: isNativeUsbPrinterAvailable(),
    });
    return () => {
      onCheckoutApi(null);
    };
  }, [onCheckoutApi, checkoutBusy, checkoutBusyMode, lineCount, payment.ready]);

  const openDateModal = () => {
    setTempSaleDateTime(
      toDatetimeLocalValue(saleDateTime ?? new Date()),
    );
    setIsDateModalOpen(true);
  };

  const backdateButton = (
    <Tooltip
      title={
        saleDateTime
          ? `Bill date: ${formatSaleDateTime(saleDateTime)} · tap to change`
          : 'Set bill date & time (optional)'
      }
    >
      <Button
        type="default"
        className={`!flex h-8 w-8 shrink-0 items-center justify-center !p-0 ${
          saleDateTime
            ? '!border-[var(--ochre-500)] !bg-[var(--ochre-100)] !text-[var(--ochre-600)]'
            : 'border-[var(--border)] text-[var(--bistre-600)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
        }`}
        icon={<CalendarClock className="h-4 w-4" aria-hidden />}
        onClick={openDateModal}
        aria-label="Set bill date and time"
      />
    </Tooltip>
  );

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden ${className}`}
    >
      {layout === 'sidebar' && (
        <header className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-semibold leading-tight text-[var(--text-primary)]">
                Current sale
              </h2>
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                {items.length === 0
                  ? 'Scan a barcode or add a line below'
                  : `${lineCount} line${lineCount === 1 ? '' : 's'} · Order #${orderId}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {backdateButton}
              {!hideAddCustomerInPanel && !customer ? (
                <Tooltip title="Add customer">
                  <Button
                    type="default"
                    className="!flex h-8 w-8 shrink-0 items-center justify-center !p-0 text-[var(--bistre-600)] border-[var(--border)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                    icon={<UserPlus className="h-4 w-4" aria-hidden />}
                    onClick={() => setDetailsOpen(true)}
                    aria-label="Add customer"
                  />
                </Tooltip>
              ) : null}
            </div>
          </div>
        </header>
      )}

      {layout === 'drawer' ? (
        <div className="flex shrink-0 items-center justify-end gap-2 border-b border-[var(--pearl-bush)] bg-[var(--linen-95)] px-4 py-2">
          {backdateButton}
          {!hideAddCustomerInPanel && !customer ? (
            <Tooltip title="Add customer">
              <Button
                type="default"
                className="!flex h-8 w-8 items-center justify-center !p-0 text-[var(--bistre-600)] border-[var(--border)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                icon={<UserPlus className="h-4 w-4" aria-hidden />}
                onClick={() => setDetailsOpen(true)}
                aria-label="Add customer"
              />
            </Tooltip>
          ) : null}
        </div>
      ) : null}

      <div className="mx-4 mt-4 shrink-0">
        <CustomerSelector
          customer={customer}
          setCustomer={setCustomer}
          onOpenDetails={() => setDetailsOpen(true)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:py-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--bistre-400)]">
              <ShoppingBag className="h-5 w-5" strokeWidth={1.6} aria-hidden />
            </span>
            <p className="text-sm font-medium text-[var(--text-primary)]">No items yet</p>
            <p className="mt-1 max-w-[16rem] text-[13px] leading-relaxed text-[var(--text-muted)]">
              Scan a barcode, use Standard or Instant billing, or Raw for manual lines.
            </p>
          </div>
        ) : (
          <ul className="space-y-2 pr-1 sm:space-y-2.5">
            {items.map((item) => (
              <li
                key={item.lineId}
                className="flex items-start gap-2 border-b border-[var(--pearl-bush)] pb-2 last:border-0 last:pb-0 sm:gap-2.5 sm:pb-2.5"
              >
                <div className="h-10 w-10 shrink-0 sm:h-11 sm:w-11">
                  <ProductLineThumb imageUrl={item.imageUrl} alt={item.name} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold leading-tight text-[var(--text-primary)] sm:text-[0.9375rem]">
                        {item.name}
                        {item.variantLabel &&
                        item.variantLabel !== 'Regular' ? (
                          <span className="font-normal text-[var(--text-muted)]">
                            {' '}
                            · {item.variantLabel}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-muted)]">
                        <span className="font-mono text-[var(--bistre-400)]">
                          {item.barcode}
                        </span>
                        <span className="text-[var(--bistre-200)]"> · </span>
                        <span>
                          {item.displayQuantity} {item.displayUnit} × ₹
                          {billDisplayUnitPrice(
                            item.stockUnitsToDeduct,
                            item.catalogUnitPrice,
                            item.displayQuantity,
                          ).toFixed(2)}
                        </span>
                      </p>
                      {shortStock.has(item.variantId) ? (
                        <p
                          role="status"
                          className="mt-0.5 text-[11px] font-medium leading-snug text-[var(--danger)]"
                        >
                          Only {shortStock.get(item.variantId)} {item.inventoryUnit} in stock
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--text-primary)] sm:text-[0.9375rem]">
                      ₹
                      {billLineSubtotal(
                        item.stockUnitsToDeduct,
                        item.catalogUnitPrice,
                      ).toFixed(2)}
                    </p>
                  </div>
                  {item.isInstant ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      {/* Quantity + unit as one control; one row like standard lines */}
                      <Space.Compact size="small">
                        <InputNumber
                          size="small"
                          className="!w-[4.5rem]"
                          aria-label={`Quantity of ${item.name}`}
                          min={
                            item.displayUnit.toUpperCase() === 'PC' ? 1 : 0.001
                          }
                          step={
                            item.displayUnit.toUpperCase() === 'PC' ? 1 : 0.5
                          }
                          value={item.displayQuantity}
                          onChange={(v) => {
                            if (v == null || onInstantLineUpdate == null) return;
                            onInstantLineUpdate(item.lineId, {
                              displayQuantity: v,
                              displayUnit: item.displayUnit,
                            });
                          }}
                        />
                        <Select
                          size="small"
                          className="!w-[4.25rem]"
                          aria-label={`Unit for ${item.name}`}
                          value={item.displayUnit}
                          options={allowedInstantDisplayUnits(
                            sizeLabel(item.variantLabel, item.name),
                            item.inventoryUnit,
                          ).map((u) => ({
                            value: u,
                            label: u,
                          }))}
                          onChange={(u) => {
                            if (onInstantLineUpdate == null) return;
                            let q = item.displayQuantity;
                            if (u.toUpperCase() === 'PC') {
                              q = Math.max(1, Math.round(q));
                            }
                            onInstantLineUpdate(item.lineId, {
                              displayQuantity: q,
                              displayUnit: u,
                            });
                          }}
                          getPopupContainer={(n) =>
                            n.parentElement ?? document.body
                          }
                        />
                      </Space.Compact>
                      <Tooltip title="Total uses the catalog price for the unit you select.">
                        <Info
                          className="h-3.5 w-3.5 shrink-0 cursor-help text-[var(--bistre-300)]"
                          aria-label="How the line total is priced"
                        />
                      </Tooltip>
                      <button
                        type="button"
                        onClick={() => onRemove(item.lineId)}
                        className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--bistre-400)] transition-colors hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
                        aria-label={`Remove ${item.name}`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex items-center overflow-hidden rounded-md border border-[var(--pearl-bush)]">
                        <button
                          type="button"
                          onClick={() => onQuantityChange(item.lineId, -1)}
                          className="flex h-7 min-w-7 items-center justify-center px-1.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--linen-95)] active:bg-[var(--bistre-100)] sm:h-8 sm:min-w-8 sm:text-base"
                        >
                          −
                        </button>
                        <span className="min-w-[1.35rem] text-center text-xs font-medium tabular-nums text-[var(--text-primary)] sm:min-w-[1.5rem] sm:text-sm">
                          {item.displayQuantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onQuantityChange(item.lineId, 1)}
                          className="flex h-7 min-w-7 items-center justify-center px-1.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--linen-95)] active:bg-[var(--ochre-100)] sm:h-8 sm:min-w-8 sm:text-base"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(item.lineId)}
                        className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-[var(--bistre-400)] transition-colors hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
                        aria-label={`Remove ${item.name}`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {items.length > 0 && (
        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 pb-4 pt-3 sm:px-5">
          {/* Totals: one tidy column, figures right-aligned */}
          <dl className="m-0 space-y-1.5 text-[13px]">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Items (incl. tax)</dt>
              <dd className="m-0 tabular-nums text-[var(--text-primary)]">₹{itemsGrossTotal.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">CGST ({cgstRate}%)</dt>
              <dd className="m-0 tabular-nums text-[var(--text-secondary)]">₹{cgstAmount.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">SGST ({sgstRate}%)</dt>
              <dd className="m-0 tabular-nums text-[var(--text-secondary)]">₹{sgstAmount.toFixed(2)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-2 text-[var(--text-secondary)]">
                Discount
                <button
                  type="button"
                  onClick={() => {
                    setTempDiscount(discount);
                    setIsDiscountModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded px-1 text-xs font-medium text-[var(--ochre-600)] hover:bg-[var(--ochre-100)]"
                  aria-label="Edit discount"
                >
                  <Pencil className="h-3 w-3" aria-hidden />
                  Edit
                </button>
              </dt>
              <dd className={`m-0 tabular-nums ${discount > 0 ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]'}`}>
                {discount > 0 ? '−' : ''}₹{discount.toFixed(2)}
              </dd>
            </div>
          </dl>

          <div className="mt-3 flex items-baseline justify-between gap-2 border-t border-[var(--border)] pt-3">
            <span className="text-sm font-medium text-[var(--text-primary)]">Payable total</span>
            <span className="text-2xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
              ₹{total.toFixed(2)}
            </span>
          </div>

          {/* Payment mode: a choice, not an action, so it is never a solid button */}
          <div className="mt-3" role="radiogroup" aria-label="Payment mode">
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { value: 'CASH', label: 'Cash', icon: <Banknote className="h-4 w-4" aria-hidden /> },
                  { value: 'UPI', label: 'UPI', icon: <Smartphone className="h-4 w-4" aria-hidden /> },
                  { value: 'CARD', label: 'Card', icon: <CreditCard className="h-4 w-4" aria-hidden /> },
                  { value: 'SPLIT', label: 'Split', icon: <Split className="h-4 w-4" aria-hidden /> },
                ] as const
              ).map((opt) => {
                const selected = paymentMethod === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => selectPaymentMode(opt.value)}
                    className={`flex h-10 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--ring)] ${
                      selected
                        ? 'border-[var(--ochre-500)] bg-[var(--ochre-100)] text-[var(--ochre-600)]'
                        : 'border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--bistre-300)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {paymentMethod === 'UPI' || paymentMethod === 'CARD' ? (
              <p className="mt-2 mb-0 text-xs text-[var(--text-muted)]">
                Collect exactly ₹{roundRupees(total).toFixed(2)} by {paymentLabel(paymentMethod)}.
              </p>
            ) : null}

            {paymentMethod === 'SPLIT' ? (
              <div className="mt-2 flex flex-col gap-1.5">
                {splitRows.map((row, index) => (
                  <div key={row.method} className="flex items-center gap-1.5">
                    <Select<PaymentLegMethod>
                      size="middle"
                      className="!w-24 shrink-0"
                      value={row.method}
                      aria-label={`Payment ${index + 1} mode`}
                      options={PAYMENT_LEG_METHODS.map((m) => ({
                        value: m,
                        label: paymentLabel(m),
                        disabled: m !== row.method && splitRows.some((r) => r.method === m),
                      }))}
                      onChange={(method) => {
                        if (row.method === 'CASH') setCashReceived(null);
                        updateSplitRow(index, { method });
                      }}
                    />
                    <InputNumber<number>
                      className="!w-full"
                      min={0}
                      step={1}
                      precision={2}
                      prefix="₹"
                      placeholder="0.00"
                      aria-label={`${paymentLabel(row.method)} amount`}
                      value={row.amount}
                      onChange={(v) => updateSplitRow(index, { amount: v ?? null })}
                    />
                    {payment.remaining > 0 ? (
                      <Tooltip title={`Put the remaining ₹${payment.remaining.toFixed(2)} on ${paymentLabel(row.method)}`}>
                        <Button
                          size="small"
                          type="text"
                          className="shrink-0 !px-1.5 text-xs"
                          onClick={() =>
                            updateSplitRow(index, {
                              amount: roundRupees((row.amount ?? 0) + payment.remaining),
                            })
                          }
                        >
                          Rest
                        </Button>
                      </Tooltip>
                    ) : null}
                    <Button
                      size="small"
                      type="text"
                      className="shrink-0"
                      aria-label={`Remove ${paymentLabel(row.method)}`}
                      icon={<X className="h-3.5 w-3.5" />}
                      disabled={splitRows.length <= 1}
                      onClick={() => removeSplitRow(index)}
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 text-xs">
                  {splitRows.length < 3 ? (
                    <Button
                      size="small"
                      type="link"
                      className="!px-0"
                      icon={<Plus className="h-3.5 w-3.5" />}
                      onClick={addSplitRow}
                    >
                      Add mode
                    </Button>
                  ) : (
                    <span />
                  )}
                  <span
                    className={`tabular-nums font-medium ${
                      Math.abs(payment.remaining) < 0.005
                        ? 'text-[var(--success)]'
                        : 'text-[var(--danger)]'
                    }`}
                    aria-live="polite"
                  >
                    {payment.remaining < -0.005
                      ? `Over by ₹${(-payment.remaining).toFixed(2)}`
                      : `Remaining ₹${Math.max(0, payment.remaining).toFixed(2)}`}
                  </span>
                </div>
              </div>
            ) : null}

            {paymentMethod === 'CASH' || (paymentMethod === 'SPLIT' && splitHasCash) ? (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <label htmlFor="pos-cash-received" className="shrink-0 text-xs text-[var(--text-secondary)]">
                    {paymentMethod === 'SPLIT' ? 'Cash received' : 'Amount received'}
                  </label>
                  <InputNumber<number>
                    id="pos-cash-received"
                    className="!w-full"
                    min={0}
                    step={10}
                    precision={2}
                    prefix="₹"
                    placeholder="Exact"
                    value={cashReceived}
                    onChange={(v) => setCashReceived(v ?? null)}
                  />
                </div>
                {cashReceived != null ? (
                  <p
                    className={`mt-1 mb-0 text-right text-sm font-semibold tabular-nums ${
                      payment.blocker?.startsWith('Cash short')
                        ? 'text-[var(--danger)]'
                        : 'text-[var(--success)]'
                    }`}
                    aria-live="polite"
                  >
                    {payment.blocker?.startsWith('Cash short')
                      ? payment.blocker.replace('Cash short', 'Short')
                      : `Change: ₹${payment.change.toFixed(2)}`}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Tooltip title="Saves the sale (when applicable), then opens a receipt preview here. Use Print for the system dialog (PDF, network printer, etc.).">
              <Button
                type="primary"
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 text-[15px] font-semibold"
                icon={<Receipt className="h-4 w-4" />}
                disabled={!payment.ready || checkoutBusy}
                loading={checkoutBusyMode === 'browser'}
                onClick={() => void completeCheckout('browser')}
              >
                Generate bill
              </Button>
            </Tooltip>
            {isNativeUsbPrinterAvailable() ? (
              <Tooltip title="Same checkout, but prints silently to the TVS-style USB thermal printer via the POS app (ESC/POS).">
                <Button
                  type="default"
                  className="flex h-10 w-full items-center justify-center gap-2 text-sm font-medium"
                  icon={<Printer className="h-4 w-4" />}
                  disabled={!payment.ready || checkoutBusy}
                  loading={checkoutBusyMode === 'thermal'}
                  onClick={() => void completeCheckout('thermal')}
                >
                  USB thermal receipt
                </Button>
              </Tooltip>
            ) : null}
            {/* <Tooltip
              title={
                'Android only: sends this bill as text to the RawBT app (set up USB printer once, then enable Auto print + Skip preview in RawBT). On Mac/PC this button will remind you to use Generate bill or switch to Android.'
              }
            >
              <Button
                type="default"
                className="flex h-10 w-full items-center justify-center gap-2 text-sm font-semibold border-[var(--pearl-bush)] sm:h-11 sm:text-base"
                icon={<Bluetooth className="h-4 w-4 sm:h-5 sm:w-5" />}
                disabled={!payment.ready || checkoutBusy}
                loading={checkoutBusyMode === 'rawbt'}
                onClick={() => void completeCheckout('rawbt')}
              >
                Print via RawBT (Android)
              </Button>
            </Tooltip> */}
          </div>

          {/* Print option, kept apart from the money so the totals read cleanly */}
          <Checkbox
            checked={showGstinOnBill}
            onChange={(e) => setShowGstinOnBill(e.target.checked)}
            className="!mt-3 !flex text-xs text-[var(--text-muted)] [&_.ant-checkbox+span]:!ps-1.5"
          >
            Show your GSTIN on the printed bill
          </Checkbox>
        </div>
      )}

      <Modal
        title="Receipt"
        open={receiptPreviewHtml != null}
        onCancel={() => setReceiptPreviewHtml(null)}
        width={560}
        centered
        destroyOnHidden
        styles={{
          body: { padding: 0, maxHeight: 'min(78vh, 720px)' },
        }}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="default" onClick={() => setReceiptPreviewHtml(null)}>
              Close
            </Button>
            <Button
              type="primary"
              style={{
                backgroundColor: 'var(--ochre-600)',
                borderColor: 'var(--ochre-600)',
              }}
              onClick={() => {
                const w = receiptIframeRef.current?.contentWindow;
                w?.focus();
                w?.print();
              }}
            >
              Print
            </Button>
          </div>
        }
      >
        <iframe
          ref={receiptIframeRef}
          title="Receipt preview"
          srcDoc={receiptPreviewHtml ?? ''}
          className="block h-[min(70vh,640px)] w-full border-0 bg-[var(--linen-80)]"
        />
      </Modal>

      <Modal
        title="Adjust Discount"
        open={isDiscountModalOpen}
        onOk={() => {
          setDiscount(tempDiscount);
          setIsDiscountModalOpen(false);
        }}
        onCancel={() => setIsDiscountModalOpen(false)}
        okText="Apply Discount"
        cancelText="Keep Current"
        okButtonProps={{ 
          style: { backgroundColor: 'var(--ochre-600)', borderColor: 'var(--ochre-600)' }
        }}
      >
        <div className="py-4">
          <p className="mb-2 text-sm text-[var(--text-secondary)]">Enter a fixed discount amount (₹) to apply to this sale.</p>
          <InputNumber
            className="w-full"
            size="large"
            min={0}
            max={itemsGrossTotal}
            value={tempDiscount}
            onChange={(val) => setTempDiscount(val ?? 0)}
            prefix="₹"
            placeholder="0.00"
            autoFocus
          />
        </div>
      </Modal>

      <Modal
        title="Bill date & time"
        open={isDateModalOpen}
        onOk={() => {
          const v = tempSaleDateTime.trim();
          if (!v) {
            setSaleDateTime(null);
            setIsDateModalOpen(false);
            return;
          }
          const parsed = new Date(v);
          if (Number.isNaN(parsed.getTime())) {
            message.error('Enter a valid date and time.');
            return;
          }
          if (parsed.getTime() > Date.now() + 60_000) {
            message.error('The bill date/time cannot be in the future.');
            return;
          }
          setSaleDateTime(parsed);
          setIsDateModalOpen(false);
        }}
        onCancel={() => setIsDateModalOpen(false)}
        okText="Apply date"
        cancelText="Cancel"
        okButtonProps={{
          style: {
            backgroundColor: 'var(--ochre-600)',
            borderColor: 'var(--ochre-600)',
          },
        }}
      >
        <div className="space-y-3 py-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Pick a past date and time for this bill. This is optional; leave it
            as-is to use the current date and time when the bill is generated.
          </p>
          <input
            type="datetime-local"
            className="w-full rounded-lg border border-[var(--pearl-bush)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--ochre-400)]"
            value={tempSaleDateTime}
            max={toDatetimeLocalValue(new Date())}
            onChange={(e) => setTempSaleDateTime(e.target.value)}
          />
          {saleDateTime ? (
            <button
              type="button"
              onClick={() => {
                setSaleDateTime(null);
                setTempSaleDateTime('');
                setIsDateModalOpen(false);
              }}
              className="text-xs font-medium text-[var(--ochre-600)] underline underline-offset-2 hover:text-[var(--ochre-700)]"
            >
              Clear and use current date &amp; time
            </button>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
