'use client';

import { App, AutoComplete, Button, Form, Input, InputNumber, Select, Tooltip } from 'antd';
import { Bluetooth, FileText, Printer, Receipt, UserPlus, UserRound, X } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { BillingPosCheckoutApi } from '@/components/BillingBillPanel/BillingBillPanel';
import type { CustomerFormValues } from '@/components/CustomerDetails';
import { getApiBaseUrl, getAuthHeaders } from '@/lib/api';
import { allowedInstantDisplayUnits, sizeLabel } from '@/lib/billingInstantPricing';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import styles from './BillingPosRawSection.module.css';

export type SelectedCatalogItem = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  inventoryUnit: string;
  catalogPrice: number;
  barcode: string;
  imageUrl: string | null;
  /** Stock on hand (inventory unit) when picked; lets the cart warn before checkout. */
  stock?: number;
};

export type RawBillFormValues = {
  itemName: string;
  unitPrice: number;
  quantity: number;
  unit: string;
  /** Set when user picks a product from the catalog search. Null = free-form manual line. */
  selectedCatalogItem: SelectedCatalogItem | null;
};

export const RAW_BILL_FORM_INITIAL: RawBillFormValues = {
  itemName: '',
  unitPrice: 0,
  quantity: 1,
  unit: 'PC',
  selectedCatalogItem: null,
};

export type RawLineAddValues = {
  itemName: string;
  unitPrice: number;
  quantity: number;
  unit: string;
  selectedCatalogItem: SelectedCatalogItem | null;
};

export type BillingPosRawSectionProps = {
  shopCode: string;
  formValues: RawBillFormValues;
  onFormChange: (next: RawBillFormValues) => void;
  onAddLine: (values: RawLineAddValues) => void;
  /** The sale's customer (shared with the sale panel); optional on a raw bill. */
  customer: CustomerFormValues | null;
  /** Opens the customer drawer to add or edit the sale's customer. */
  onEditCustomer: () => void;
  onRemoveCustomer: () => void;
  showSaleCheckoutHint?: boolean;
  checkoutApi?: BillingPosCheckoutApi | null;
  showCheckoutButtons?: boolean;
};

type SearchOption = {
  value: string;
  label: React.ReactNode;
  item: SelectedCatalogItem;
};

type ApiVariantResultRow = {
  id: string;
  productId?: string;
  product_id?: string;
  product?: { name?: string };
  productName?: string;
  product_name?: string;
  variantName?: string;
  variant_name?: string;
  name?: string;
  barcode?: string;
  unit?: string;
  price?: number;
  quantity?: number | string;
  imageUrl?: string | null;
  image_url?: string | null;
};

function BillingPosRawSectionInner({
  shopCode,
  formValues,
  onFormChange,
  onAddLine,
  customer,
  onEditCustomer,
  onRemoveCustomer,
  showSaleCheckoutHint,
  checkoutApi,
  showCheckoutButtons,
}: BillingPosRawSectionProps) {
  const { message } = App.useApp();
  const [searchText, setSearchText] = useState('');
  const [searchOptions, setSearchOptions] = useState<SearchOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debouncedSearch = useDebouncedValue(searchText, 350);
  const abortRef = useRef<AbortController | null>(null);

  const patch = useCallback(
    (partial: Partial<RawBillFormValues>) => {
      onFormChange({ ...formValues, ...partial });
    },
    [formValues, onFormChange],
  );

  useEffect(() => {
    const q = debouncedSearch.trim();
    if (!q || !shopCode) {
      setSearchOptions([]);
      setSearchLoading(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearchLoading(true);

    const base = getApiBaseUrl();
    const url = `${base}/inventory/variants?q=${encodeURIComponent(q)}&activeOnly=1&page=1&size=12`;

    fetch(url, {
      headers: { ...getAuthHeaders(), Accept: 'application/json' },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json() as Promise<{ data?: ApiVariantResultRow[] }>;
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        const rows: ApiVariantResultRow[] = json?.data ?? [];
        const opts: SearchOption[] = rows.map((r) => {
          const pName = String(
            r.productName ?? r.product_name ?? (r.product as Record<string, unknown>)?.name ?? '',
          ).trim();
          const vName = String(r.variantName ?? r.variant_name ?? r.name ?? '').trim();
          const displayName =
            vName && vName !== pName ? `${pName} · ${vName}` : pName || vName;
          const invUnit = String(r.unit ?? 'PC').toUpperCase();
          const price = Number(r.price ?? 0);
          return {
            value: displayName,
            label: (
              <div className="flex items-center justify-between gap-2 py-0.5">
                <span className="truncate text-sm font-medium text-[var(--bistre-800)]">
                  {displayName}
                </span>
                <span className="shrink-0 text-xs font-semibold text-[var(--ochre-600)]">
                  ₹{price.toFixed(0)}/{invUnit}
                </span>
              </div>
            ),
            item: {
              variantId: String(r.id),
              productId: String(r.productId ?? r.product_id ?? ''),
              productName: pName,
              variantName: vName,
              inventoryUnit: invUnit,
              catalogPrice: price,
              barcode: String(r.barcode ?? ''),
              imageUrl: (r.imageUrl ?? r.image_url ?? null) as string | null,
              stock: r.quantity != null ? Number(r.quantity) : undefined,
            },
          };
        });
        setSearchOptions(opts);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        message.error('Could not load product suggestions. Check your connection and try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearchLoading(false);
      });

    return () => controller.abort();
  }, [debouncedSearch, shopCode, message]);

  const handleClearSelection = useCallback(() => {
    setSearchText('');
    setSearchOptions([]);
    patch({
      itemName: '',
      unitPrice: 0,
      quantity: 1,
      unit: 'PC',
      selectedCatalogItem: null,
    });
  }, [patch]);

  const handleAdd = useCallback(() => {
    const name = formValues.itemName.trim();
    const price = Number(formValues.unitPrice);
    const qty = Number(formValues.quantity);
    if (!name) {
      message.warning('Enter or select an item name before adding.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      message.warning('Enter a valid price (₹0 or more).');
      return;
    }
    if (!Number.isFinite(qty) || qty < 0.000001) {
      message.warning('Enter a valid quantity.');
      return;
    }
    onAddLine({
      itemName: name,
      unitPrice: price,
      quantity: qty,
      unit: formValues.unit || 'PC',
      selectedCatalogItem: formValues.selectedCatalogItem,
    });
    setSearchText('');
    setSearchOptions([]);
    patch({
      itemName: '',
      unitPrice: 0,
      quantity: 1,
      unit: 'PC',
      selectedCatalogItem: null,
    });
  }, [formValues, onAddLine, patch, message]);

  const isCatalogSelected = formValues.selectedCatalogItem !== null;

  const COMMON_UNITS = ['PC', 'KG', 'gm', 'ml', 'L', 'BOX', 'PKT', 'PLATE'];
  const unitOptions = isCatalogSelected
    ? allowedInstantDisplayUnits(
        sizeLabel(
          formValues.selectedCatalogItem!.variantName,
          formValues.selectedCatalogItem!.productName,
        ),
        formValues.selectedCatalogItem!.inventoryUnit,
      ).map((u) => ({ value: u, label: u }))
    : COMMON_UNITS.map((u) => ({ value: u, label: u }));

  return (
    <div className={`min-h-0 flex-1 overflow-auto p-3 sm:p-5 ${styles.wrap}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ochre-100)] text-[var(--ochre-600)] sm:h-11 sm:w-11">
            <FileText className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--bistre-800)]">
              Raw bill (manual billing of items not in the sale panel)
            </h2>
            <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-muted)] sm:text-xs sm:leading-relaxed">
              Search your catalog to add a tracked item - it will create an order and deduct stock.
              Or enter a custom name for an untracked line that appears on the receipt only.
            </p>
          </div>
        </div>
      </div>

      <Form layout="vertical" requiredMark={false} className={styles.form}>
        <div className={styles.rowTwo}>
          <Form.Item
            label={<span className={styles.label}>Item name</span>}
            className={styles.grow}
          >
            {isCatalogSelected ? (
              <Input
                readOnly
                value={formValues.itemName}
                style={{ backgroundColor: 'var(--parchment)', cursor: 'default' }}
                suffix={
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:text-[var(--danger)]"
                    aria-label="Clear catalog selection"
                  >
                    <X className="h-3 w-3" />
                  </button>
                }
              />
            ) : (
              <AutoComplete
                className="w-full"
                options={searchOptions}
                value={formValues.itemName}
                onSearch={(text) => {
                  setSearchText(text);
                  patch({ itemName: text, selectedCatalogItem: null });
                }}
                onSelect={(_val, option) => {
                  const opt = option as unknown as SearchOption;
                  setSearchText('');
                  setSearchOptions([]);
                  patch({
                    itemName: opt.value,
                    unitPrice: opt.item.catalogPrice,
                    unit: opt.item.inventoryUnit,
                    quantity: 1,
                    selectedCatalogItem: opt.item,
                  });
                }}
                placeholder="Search products or enter a custom name"
                notFoundContent={
                  searchLoading
                    ? 'Searching…'
                    : debouncedSearch.trim().length > 0
                      ? 'No products found'
                      : undefined
                }
                backfill={false}
                maxLength={200}
              />
            )}
          </Form.Item>

          <Form.Item label={<span className={styles.label}>Price (₹, incl. tax)</span>}>
            <InputNumber
              className="w-full min-w-0"
              min={0}
              value={formValues.unitPrice || null}
              onChange={(v) => patch({ unitPrice: v ?? 0 })}
              placeholder="0"
              readOnly={isCatalogSelected}
              style={isCatalogSelected ? { backgroundColor: 'var(--parchment)' } : undefined}
            />
          </Form.Item>

          <Form.Item label={<span className={styles.label}>Unit</span>}>
            <Select
              className="w-full min-w-0"
              value={formValues.unit}
              options={unitOptions}
              onChange={(u) => patch({ unit: u })}
            />
          </Form.Item>


          <Form.Item label={<span className={styles.label}>Qty</span>}>
            <InputNumber
              className="w-full min-w-0"
              min={0.000001}
              step={1}
              value={formValues.quantity || null}
              onChange={(v) => patch({ quantity: v ?? 1 })}
            />
          </Form.Item>
        </div>

        {isCatalogSelected && (
          <p className="-mt-1 mb-3 rounded-md border border-[var(--border)] bg-[var(--success-bg)] px-2.5 py-1.5 text-xs text-[var(--success)]">
            Catalog item selected
          </p>
        )}

        <Button
          type="primary"
          className="w-full sm:w-auto"
          onClick={handleAdd}
          disabled={
            !formValues.itemName.trim() ||
            !Number.isFinite(Number(formValues.unitPrice)) ||
            Number(formValues.unitPrice) < 0
          }
          style={{
            backgroundColor: 'var(--ochre-600)',
            borderColor: 'var(--ochre-600)',
          }}
        >
          {isCatalogSelected ? 'Add Catalog Item' : 'Add Item for sale'}
        </Button>

        {/* Same customer as the sale panel, so it is saved with the order and printed on the bill. */}
        <div className={styles.sectionLabel}>Want to add a customer? (Optional)</div>
        {customer ? (
          <div className="flex items-start gap-3 rounded-xl border border-[var(--pearl-bush)] bg-[var(--parchment)] px-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ochre-100)] text-[var(--ochre-600)]">
              <UserRound className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-[var(--text-primary)]">{customer.name}</p>
              <p className="text-xs text-[var(--text-secondary)]">{customer.phone}</p>
              {customer.gstin?.trim() ? (
                <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
                  GSTIN {customer.gstin.trim()}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="small" onClick={onEditCustomer}>
                Edit
              </Button>
              <Button size="small" danger onClick={onRemoveCustomer}>
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              The bill prints without a customer. Add one to show their name and GSTIN on it.
            </p>
            <Button icon={<UserPlus className="h-4 w-4" aria-hidden />} onClick={onEditCustomer}>
              Add customer
            </Button>
          </div>
        )}
      </Form>

      {showCheckoutButtons && checkoutApi ? (
        <div className="mt-5 rounded-xl border border-[var(--pearl-bush)] bg-[var(--linen-95)] p-3 sm:p-4">
          <p className="mb-2 text-xs font-medium text-[var(--bistre-400)]">
            Print this raw sale
          </p>
          <p className="mb-3 text-[11px] leading-snug text-[var(--text-muted)] sm:text-xs">
            Choose payment (Cash / UPI) in the sale panel first. Prefer{' '}
            <strong>USB thermal</strong> in the POS app for reliable cut and no RawBT quirks. RawBT
            can lose the USB device until you reconnect it in RawBT.
          </p>
          <div className="flex flex-col gap-2">
            <Tooltip title="Saves when needed, then opens a receipt preview on this page. Use Print for the system dialog.">
              <Button
                type="primary"
                className="flex h-10 w-full items-center justify-center gap-2"
                icon={<Receipt className="h-4 w-4" />}
                disabled={!checkoutApi.canPrint || checkoutApi.busy}
                loading={checkoutApi.busyMode === 'browser'}
                onClick={() => {
                  if (!checkoutApi.canPrint) {
                    message.warning(
                      'Add lines and select Cash or UPI / Card in the sale panel first.',
                    );
                    return;
                  }
                  checkoutApi.printBrowser();
                }}
                style={{
                  backgroundColor: 'var(--ochre-600)',
                  borderColor: 'var(--ochre-600)',
                }}
              >
                Generate bill
              </Button>
            </Tooltip>
            {checkoutApi.showUsbThermal ? (
              <Tooltip title="Prints via the Android app USB bridge (ESC/POS). Closest match to the SnapBizz-style cut.">
                <Button
                  type="default"
                  className="flex h-10 w-full items-center justify-center gap-2 border-[var(--pearl-bush)]"
                  icon={<Printer className="h-4 w-4" />}
                  disabled={!checkoutApi.canPrint || checkoutApi.busy}
                  loading={checkoutApi.busyMode === 'thermal'}
                  onClick={() => {
                    if (!checkoutApi.canPrint) {
                      message.warning(
                        'Add lines and select Cash or UPI / Card in the sale panel first.',
                      );
                      return;
                    }
                    checkoutApi.printThermal();
                  }}
                >
                  USB thermal receipt
                </Button>
              </Tooltip>
            ) : null}
            <Tooltip title="Sends raw bytes via RawBT. If the printer stops responding, reconnect USB in RawBT.">
              <Button
                type="default"
                className="flex h-10 w-full items-center justify-center gap-2 border-[var(--pearl-bush)]"
                icon={<Bluetooth className="h-4 w-4" />}
                disabled={!checkoutApi.canPrint || checkoutApi.busy}
                loading={checkoutApi.busyMode === 'rawbt'}
                onClick={() => {
                  if (!checkoutApi.canPrint) {
                    message.warning(
                      'Add lines and select Cash or UPI / Card in the sale panel first.',
                    );
                    return;
                  }
                  checkoutApi.printRawBt();
                }}
              >
                Print via RawBT (Android)
              </Button>
            </Tooltip>
          </div>
        </div>
      ) : null}

      {showSaleCheckoutHint ? (
        <p className="mt-4 text-[11px] leading-snug text-[var(--text-muted)] sm:text-xs">
          Open <strong>Review &amp; pay</strong>, pick payment, then use{' '}
          <strong>Generate bill</strong>, <strong>USB thermal</strong>, or{' '}
          <strong>Print via RawBT</strong>, or the <strong>RawBT</strong> button in the panel
          header on Android. Catalog items deduct stock when you pay; custom lines appear on
          the receipt only.
        </p>
      ) : null}
    </div>
  );
}

export const BillingPosRawSection = memo(BillingPosRawSectionInner);
