"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Drawer, Segmented, Tabs, Tooltip } from "antd";
import { motion } from "framer-motion";
import { Bluetooth, Receipt, ScanBarcode } from "lucide-react";
import { ContentSkeleton } from "@/components/ContentSkeleton/ContentSkeleton";
import { BarcodeScannerInput } from "@/components/BarcodeScannerInput/BarcodeScannerInput";
import {
  BillingBillPanel,
  type BillItem,
  type BillingCustomerBinding,
  type BillingPosCheckoutApi,
} from "@/components/BillingBillPanel/BillingBillPanel";
import {
  BillingPosRawSection,
  RAW_BILL_FORM_INITIAL,
  type RawBillFormValues,
  type RawLineAddValues,
} from "@/components/BillingPosRawSection/BillingPosRawSection";
import CustomerDetails, {
  type CustomerFormValues,
} from "@/components/CustomerDetails";
import { BillingPosManualSection } from "@/components/BillingPosManualSection/BillingPosManualSection";
import type { BillingVariantRow } from "@/hooks/useBillingPosVariants";
import {
  billLineSubtotal,
  computeInstantStockDeduction,
  defaultInstantDisplay,
  sizeLabel,
} from "@/lib/billingInstantPricing";
import { isLikelyAndroidForRawBt } from "@/lib/rawBtPrint";
import { apiFetch } from "@/lib/api";
import { useShop } from "@/contexts/ShopContext";
import { useAuth } from "@/contexts/AuthContext";
import { CUSTOMER_PHONE_EDIT_ROLES } from "@/lib/customerFields";
import styles from "./page.module.css";

const POS_DRAFT_KEY_PREFIX = "fluxen_pos_draft:";

const inrCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function variantRowToBillItem(row: BillingVariantRow): BillItem {
  const inv = row.unit ?? "PC";
  return {
    lineId: row.variantId,
    variantId: row.variantId,
    productId: row.productId,
    name: row.productName,
    variantLabel: row.variantName,
    barcode: row.barcode,
    catalogUnitPrice: row.price,
    stockUnitsToDeduct: 1,
    displayQuantity: 1,
    displayUnit: inv,
    inventoryUnit: inv,
    imageUrl: row.imageUrl ?? row.images?.[0]?.url ?? null,
    isInstant: false,
    availableStock: row.stock,
  };
}

export default function BillingPOSPage() {
  const { effectiveShopCode } = useShop();
  const shopCode =
    effectiveShopCode || process.env.NEXT_PUBLIC_API_DEFAULT_SHOP_CODE || "";

  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [billingStockRefreshKey, setBillingStockRefreshKey] = useState(0);
  const [customer, setCustomer] = useState<CustomerFormValues | null>(null);
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const billingShellRef = useRef<HTMLDivElement>(null);
  const [stackedBillingLayout, setStackedBillingLayout] = useState(true);
  const [billDrawerOpen, setBillDrawerOpen] = useState(false);
  const prevBillLenRef = useRef(0);
  const [billingTab, setBillingTab] = useState<"standard" | "instant" | "raw">(
    "standard"
  );
  const [rawBillForm, setRawBillForm] = useState<RawBillFormValues>(
    RAW_BILL_FORM_INITIAL
  );
  const [checkoutApi, setCheckoutApi] = useState<BillingPosCheckoutApi | null>(
    null
  );

  // A restored cart's stock figures date from when each line was added; fetch the
  // current on-hand amount so the low-stock warning reflects stock as it is now.
  const refreshLineStock = useCallback((lines: BillItem[]) => {
    const ids = [
      ...new Set(lines.filter((l) => !l.isRaw && l.availableStock != null).map((l) => l.variantId)),
    ];
    if (ids.length === 0) return;
    void Promise.all(
      ids.map((id) =>
        apiFetch(`/inventory/variants/${id}`)
          .then((r) => (r.ok ? (r.json() as Promise<{ quantity?: number | string }>) : null))
          .then((v) => (v?.quantity != null ? ([id, Number(v.quantity)] as const) : null))
          .catch(() => null),
      ),
    ).then((rows) => {
      const fresh = new Map(rows.filter((r) => r != null));
      if (fresh.size === 0) return;
      setBillItems((prev) =>
        prev.map((l) =>
          fresh.has(l.variantId) ? { ...l, availableStock: fresh.get(l.variantId) } : l,
        ),
      );
    });
  }, []);

  // Keep the sale in progress if the cashier leaves the POS page or reloads (per tab and
  // shop; sessionStorage, so a stale cart never shows up in another tab or on another day).
  const draftKey = `${POS_DRAFT_KEY_PREFIX}${shopCode}`;
  const [draftShop, setDraftShop] = useState<string | null>(null);

  useEffect(() => {
    if (!shopCode || draftShop === shopCode) return;
    try {
      const raw = sessionStorage.getItem(draftKey);
      const draft = raw
        ? (JSON.parse(raw) as { items?: BillItem[]; customer?: CustomerFormValues | null })
        : null;
      if (Array.isArray(draft?.items) && draft.items.length > 0) {
        setBillItems(draft.items);
        refreshLineStock(draft.items);
      }
      if (draft?.customer) setCustomer(draft.customer);
    } catch {
      // Storage blocked or draft unreadable: start with an empty sale.
    }
    // Saving starts on the next render, once the restored lines are in state.
    setDraftShop(shopCode);
  }, [shopCode, draftKey, draftShop, refreshLineStock]);

  useEffect(() => {
    if (!shopCode || draftShop !== shopCode) return;
    try {
      if (billItems.length === 0 && !customer) sessionStorage.removeItem(draftKey);
      else sessionStorage.setItem(draftKey, JSON.stringify({ items: billItems, customer }));
    } catch {
      // Storage full or blocked: the sale still works, it just won't survive navigation.
    }
  }, [shopCode, draftKey, draftShop, billItems, customer]);

  useLayoutEffect(() => {
    const el = billingShellRef.current;
    if (!el) return;
    const sync = () => {
      setStackedBillingLayout(el.getBoundingClientRect().width < 1024);
    };
    sync();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { user } = useAuth();
  const canEditCustomerPhone = CUSTOMER_PHONE_EDIT_ROLES.includes(user?.role ?? "");

  const customerBinding: BillingCustomerBinding = {
    customer,
    setCustomer,
    detailsOpen: customerDetailsOpen,
    setDetailsOpen: setCustomerDetailsOpen,
  };

  const openCustomerDetails = useCallback(() => {
    setCustomerDetailsOpen(true);
  }, []);

  const mergeLine = useCallback((line: BillItem) => {
    setBillItems((prev) => {
      if (line.isRaw) {
        return [...prev, { ...line }];
      }
      if (line.isInstant) {
        // Repeat Add on an untouched instant line of the same item and unit bumps it;
        // a line the cashier has edited (custom weight/unit) is kept as its own line.
        const target = [...prev]
          .reverse()
          .find(
            (i) =>
              i.isInstant &&
              !i.instantEdited &&
              i.variantId === line.variantId &&
              i.displayUnit === line.displayUnit
          );
        if (target) {
          const q = target.displayQuantity + line.displayQuantity;
          return prev.map((i) =>
            i.lineId === target.lineId
              ? {
                  ...i,
                  displayQuantity: q,
                  stockUnitsToDeduct: computeInstantStockDeduction(
                    sizeLabel(i.variantLabel, i.name),
                    i.inventoryUnit,
                    q,
                    i.displayUnit
                  ),
                }
              : i
          );
        }
        return [...prev, { ...line }];
      }
      if (!line.isInstant) {
        const existing = prev.find(
          (i) => !i.isInstant && !i.isRaw && i.variantId === line.variantId
        );
        if (existing) {
          return prev.map((i) =>
            i.lineId === existing.lineId
              ? {
                  ...i,
                  stockUnitsToDeduct:
                    i.stockUnitsToDeduct + line.stockUnitsToDeduct,
                  displayQuantity: i.displayQuantity + line.displayQuantity,
                }
              : i
          );
        }
      }
      return [...prev, { ...line }];
    });
  }, []);

  const addRowManual = useCallback(
    (row: BillingVariantRow) => {
      mergeLine(variantRowToBillItem(row));
    },
    [mergeLine]
  );

  const addRawBillLine = useCallback(
    (pick: RawLineAddValues) => {
      const lineId = crypto.randomUUID();
      if (pick.selectedCatalogItem) {
        const {
          variantId,
          productId,
          productName,
          variantName,
          inventoryUnit,
          catalogPrice,
          barcode,
          imageUrl,
          stock: availableStock,
        } = pick.selectedCatalogItem;
        const stock = computeInstantStockDeduction(
          sizeLabel(variantName, productName),
          inventoryUnit,
          pick.quantity,
          pick.unit
        );
        mergeLine({
          lineId,
          variantId,
          productId,
          name: productName,
          variantLabel: variantName,
          barcode: barcode || "-",
          catalogUnitPrice: catalogPrice,
          stockUnitsToDeduct: stock,
          displayQuantity: pick.quantity,
          displayUnit: pick.unit,
          inventoryUnit,
          imageUrl: imageUrl ?? null,
          isInstant: true,
          availableStock,
        });
      } else {
        mergeLine({
          lineId,
          variantId: `raw:${lineId}`,
          productId: "raw-line",
          name: pick.itemName,
          variantLabel: "Regular",
          barcode: "-",
          catalogUnitPrice: pick.unitPrice,
          stockUnitsToDeduct: pick.quantity,
          displayQuantity: pick.quantity,
          displayUnit: "PC",
          inventoryUnit: "PC",
          imageUrl: null,
          isRaw: true,
        });
      }
    },
    [mergeLine]
  );

  const addInstantLine = useCallback(
    (row: BillingVariantRow) => {
      const inv = row.unit ?? "PC";
      const label = sizeLabel(row.variantName, row.productName);
      const { displayQuantity, displayUnit } = defaultInstantDisplay(
        label,
        inv
      );
      const stock = computeInstantStockDeduction(
        label,
        inv,
        displayQuantity,
        displayUnit
      );
      mergeLine({
        lineId: crypto.randomUUID(),
        variantId: row.variantId,
        productId: row.productId,
        name: row.productName,
        variantLabel: row.variantName,
        barcode: row.barcode,
        catalogUnitPrice: row.price,
        stockUnitsToDeduct: stock,
        displayQuantity,
        displayUnit,
        inventoryUnit: inv,
        imageUrl: row.imageUrl ?? row.images?.[0]?.url ?? null,
        isInstant: true,
        availableStock: row.stock,
      });
    },
    [mergeLine]
  );

  const updateInstantLine = useCallback(
    (
      lineId: string,
      next: { displayQuantity: number; displayUnit: string }
    ) => {
      let q = next.displayQuantity;
      const u = next.displayUnit;
      if (u.toUpperCase() === "PC") {
        q = Math.max(1, Math.round(q));
      } else {
        q = Math.max(1e-6, q);
      }
      setBillItems((prev) =>
        prev.map((i) => {
          if (i.lineId !== lineId || !i.isInstant) return i;
          const stock = computeInstantStockDeduction(
            sizeLabel(i.variantLabel, i.name),
            i.inventoryUnit,
            q,
            u
          );
          return {
            ...i,
            displayQuantity: q,
            displayUnit: u,
            stockUnitsToDeduct: stock,
            instantEdited: true,
          };
        })
      );
    },
    []
  );

  const updateQuantity = useCallback((lineId: string, delta: number) => {
    setBillItems((prev) =>
      prev
        .map((i) => {
          if (i.lineId !== lineId || i.isInstant) return i;
          const nextQty = Math.max(0, i.displayQuantity + delta);
          const nextStock = Math.max(0, i.stockUnitsToDeduct + delta);
          return {
            ...i,
            displayQuantity: nextQty,
            stockUnitsToDeduct: nextStock,
          };
        })
        .filter((i) => i.stockUnitsToDeduct > 1e-9)
    );
  }, []);

  const removeFromBill = useCallback((lineId: string) => {
    setBillItems((prev) => prev.filter((i) => i.lineId !== lineId));
  }, []);

  const clearSale = useCallback(() => {
    setBillItems([]);
  }, []);

  useEffect(() => {
    if (!stackedBillingLayout) {
      setBillDrawerOpen(false);
      prevBillLenRef.current = billItems.length;
      return;
    }
    if (prevBillLenRef.current === 0 && billItems.length > 0) {
      setBillDrawerOpen(true);
    }
    prevBillLenRef.current = billItems.length;
  }, [stackedBillingLayout, billItems.length]);

  const saleLineCount = billItems.length;

  const itemsGrossTotal = useMemo(
    () =>
      billItems.reduce(
        (s, i) =>
          s + billLineSubtotal(i.stockUnitsToDeduct, i.catalogUnitPrice),
        0
      ),
    [billItems]
  );

  if (!shopCode) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4">
        <p className="text-sm text-[var(--bistre-600)]">
          Select a shop in the header to use Billing POS.
        </p>
        <ContentSkeleton
          variant="rows"
          rowCount={12}
          className="min-h-[320px]"
        />
      </div>
    );
  }

  const billPanelProps = {
    items: billItems,
    onQuantityChange: updateQuantity,
    onRemove: removeFromBill,
    onInstantLineUpdate: updateInstantLine,
    onSaleComplete: () => {
      clearSale();
      // Next bill starts as walk-in so the previous customer is never carried over.
      setCustomer(null);
      setRawBillForm(RAW_BILL_FORM_INITIAL);
      setBillingStockRefreshKey((k) => k + 1);
      setBillDrawerOpen(false);
    },
    orderId: "draft" as const,
    customerBinding,
    hideAddCustomerInPanel: stackedBillingLayout,
    onCheckoutApi: setCheckoutApi,
  };

  return (
    <div
      ref={billingShellRef}
      className={`${styles.billingPageShell} min-h-0 flex-1 ${stackedBillingLayout ? styles.shellStackedPad : ""}`}
    >
      <div className={`${styles.billingLayout} min-h-0`}>
        <div className={styles.billingMain}>
          {/* Title and billing mode on one line; the mode switch replaces the old tab strip */}
          <div className={styles.posHeader}>
            <h1 className="m-0 leading-none">Billing POS</h1>
            <Segmented<"standard" | "instant" | "raw">
              value={billingTab}
              onChange={setBillingTab}
              options={[
                { label: "Standard", value: "standard" },
                { label: "Instant", value: "instant" },
                { label: "Raw", value: "raw" },
              ]}
              aria-label="Billing mode"
            />
          </div>

          {billingTab === "standard" ? (
            <div className="shrink-0">
              <BarcodeScannerInput onAddProduct={addRowManual} />
            </div>
          ) : null}

          <Tabs
            className={`${styles.billingModeTabs} min-h-0 flex-1`}
            activeKey={billingTab}
            onChange={(k) => setBillingTab(k as "standard" | "instant" | "raw")}
            renderTabBar={() => <span hidden />}
            items={[
              {
                key: "standard",
                label: "Standard",
                children: (
                  <BillingPosManualSection
                    shopCode={shopCode}
                    onAddProduct={addRowManual}
                    dataRefreshKey={billingStockRefreshKey}
                    showToolbarAddCustomer={stackedBillingLayout}
                    onToolbarAddCustomer={openCustomerDetails}
                    showSaleCheckoutHint={stackedBillingLayout}
                    sectionTitle="Standard billing"
                    sectionHint="Fixed packs and SKUs. Lines merge when you add the same variant again."
                  />
                ),
              },
              {
                key: "instant",
                label: "Instant",
                children: (
                  <BillingPosManualSection
                    shopCode={shopCode}
                    onAddProduct={addInstantLine}
                    dataRefreshKey={billingStockRefreshKey}
                    showToolbarAddCustomer={stackedBillingLayout}
                    onToolbarAddCustomer={openCustomerDetails}
                    showSaleCheckoutHint={stackedBillingLayout}
                    sectionTitle="Instant billing"
                    sectionHint="Custom weights or pours (e.g. 400 g of a kg-priced sweet). After Add, set quantity and unit in the sale panel - the total follows the variant’s list price proportionally."
                    hideBarcodeColumn
                  />
                ),
              },
              {
                key: "raw",
                label: "Raw",
                children: (
                  <BillingPosRawSection
                    shopCode={shopCode}
                    formValues={rawBillForm}
                    onFormChange={setRawBillForm}
                    onAddLine={addRawBillLine}
                    customer={customer}
                    onEditCustomer={openCustomerDetails}
                    onRemoveCustomer={() => setCustomer(null)}
                    showSaleCheckoutHint={stackedBillingLayout}
                    checkoutApi={checkoutApi}
                    showCheckoutButtons={false}
                  />
                ),
              },
            ]}
          />
        </div>

        {stackedBillingLayout ? (
          <motion.button
            type="button"
            className={styles.mobileBillBar}
            onClick={() => setBillDrawerOpen(true)}
            aria-label="Open current sale and checkout"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.985 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={styles.mobileBillBarInner}>
              <Receipt
                className="h-5 w-5 shrink-0 text-[var(--ochre-600)]"
                aria-hidden
              />
              <div className={styles.mobileBillBarText}>
                <span className={styles.mobileBillBarKicker}>Current sale</span>
                <span className={styles.mobileBillBarSummary}>
                  {billItems.length === 0
                    ? "No lines yet - tap to add customer & pay"
                    : `${saleLineCount} ${saleLineCount === 1 ? "line" : "lines"} · ${inrCompact.format(itemsGrossTotal)} (incl. tax)`}
                </span>
              </div>
              <span className={styles.mobileBillBarCta}>Review & pay</span>
            </div>
          </motion.button>
        ) : (
          <aside className={styles.sidebar}>
            <BillingBillPanel
              {...billPanelProps}
              layout="sidebar"
              className="h-full min-h-0 min-w-0 w-full flex-1"
            />
          </aside>
        )}
      </div>

      {stackedBillingLayout ? (
        <Drawer
          rootClassName={styles.billDrawer}
          title="Current sale"
          placement="bottom"
          size="90%"
          open={billDrawerOpen}
          onClose={() => setBillDrawerOpen(false)}
          destroyOnClose={false}
          extra={
            isLikelyAndroidForRawBt() && checkoutApi ? (
              <Tooltip title="Saves the sale and sends thermal text to RawBT (same as Print via RawBT below). Choose Cash or UPI / Card first.">
                <Button
                  type="default"
                  size="small"
                  className="border-[var(--pearl-bush)]"
                  icon={<Bluetooth className="h-3.5 w-3.5" aria-hidden />}
                  disabled={!checkoutApi.canPrint || checkoutApi.busy}
                  loading={checkoutApi.busy}
                  onClick={() => checkoutApi.printRawBt()}
                >
                  RawBT
                </Button>
              </Tooltip>
            ) : null
          }
          styles={{
            body: {
              padding: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              maxHeight: "calc(100dvh - 120px)",
            },
          }}
        >
          <BillingBillPanel
            {...billPanelProps}
            layout="drawer"
            className="h-full min-h-0 min-w-0 w-full flex-1 overflow-hidden"
          />
        </Drawer>
      ) : null}

      <CustomerDetails
        open={customerDetailsOpen}
        onCancel={() => setCustomerDetailsOpen(false)}
        initialValues={customer ?? undefined}
        customerId={customer?.id}
        canEditPhone={canEditCustomerPhone}
        onSave={(values) => setCustomer(values)}
      />
    </div>
  );
}
