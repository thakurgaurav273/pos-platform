"use client";

import { App, Button, Dropdown, Input, Segmented } from "antd";
import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { DataTable, type AppTableColumn } from "@/components/DataTable/DataTable";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import {
  BarcodePrintModal,
  type BarcodePrintItem,
} from "@/components/BarcodePrintModal/BarcodePrintModal";
import { RefillRequestModal } from "@/components/RefillRequestModal/RefillRequestModal";
import { STOCK_STATE_LABEL, stockStateOf } from "@/lib/stockState";
import {
  apiFetch,
  apiFetchLong,
  getApiBaseUrl,
  getAuthHeaders,
  getEffectiveShopCodeForHeader,
} from "@/lib/api";
import { openPrintableBarcodes } from "@/lib/printBarcodes";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useShop } from "@/contexts/ShopContext";
import { useAuth } from "@/contexts/AuthContext";
import { isAtLeastManager } from "@/lib/rolePermissions";
import {
  Copy,
  Download,
  MoreHorizontal,
  Pencil,
  Printer,
  PackagePlus,
  PackageSearch,
  Trash2,
} from "lucide-react";
import styles from "./InventoryTable.module.css";

type InventoryRow = {
  id: string;
  productName: string;
  variantName?: string;
  category?: string;
  sku?: string;
  barcode: string;
  quantity: number;
  minStock?: number | null;
  unit?: string;
  price: number;
  imageUrl?: string | null;
};

const qtyFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

const PAGE_SIZE = 40;
const PAGE_SIZE_OPTIONS = [10, 25, 40, 50];

type StockFilter = "all" | "low";

export default function InventoryTable({
  shopCodeOverride,
  initialLowStock = false,
}: {
  shopCodeOverride?: string;
  /** Start on the low-stock list (e.g. from the dashboard's "Low or out of stock" tile). */
  initialLowStock?: boolean;
}) {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const pathname = usePathname();
  const { effectiveShopCode, shops, shopsLoading } = useShop();
  const defaultShop = process.env.NEXT_PUBLIC_API_DEFAULT_SHOP_CODE ?? "";

  const isFactory = useMemo(() => {
    if (shopsLoading && shops.length === 0) return false;
    const s = shops.find((x) => x.shopCode === effectiveShopCode);
    return !!s?.isFactory;
  }, [shops, effectiveShopCode, shopsLoading]);

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 500);
  const searchRef = useRef(debouncedSearch);
  searchRef.current = debouncedSearch;
  const [stockFilter, setStockFilter] = useState<StockFilter>(
    initialLowStock ? "low" : "all",
  );
  const stockFilterRef = useRef(stockFilter);
  stockFilterRef.current = stockFilter;

  const changeStockFilter = useCallback(
    (next: StockFilter) => {
      setStockFilter(next);
      // Keep the URL shareable / back-button friendly without a full navigation. Other
      // params stay, so the Products page keeps ?tab=stock.
      const params = new URLSearchParams(window.location.search);
      if (next === "low") params.set("filter", "low-stock");
      else params.delete("filter");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const [printItems, setPrintItems] = useState<BarcodePrintItem[]>([]);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [isPrintingAll, setIsPrintingAll] = useState(false);
  const [refillModalOpen, setRefillModalOpen] = useState(false);
  const [cloneCatalogBusy, setCloneCatalogBusy] = useState(false);
  const [purgeCatalogBusy, setPurgeCatalogBusy] = useState(false);
  const { user: authUser } = useAuth();
  const [deleteSelectedBusy, setDeleteSelectedBusy] = useState(false);

  const selectionRef = useRef<Set<string>>(new Set());
  const [, bumpSelection] = useReducer((n: number) => n + 1, 0);
  const pageRowsRef = useRef<InventoryRow[]>([]);

  const shopKey = shopCodeOverride || effectiveShopCode || getEffectiveShopCodeForHeader() || defaultShop;
  const filterKey = `${shopKey}|${debouncedSearch}|${stockFilter}`;

  const [exporting, setExporting] = useState(false);
  /** Exports every SKU matching the current search and All / Low stock filter. */
  const handleExport = useCallback(async () => {
    if (!shopKey) return;
    setExporting(true);
    try {
      const { fetchAllPages, downloadInventoryExcel } = await import("@/lib/listExports");
      const lowStock = stockFilterRef.current === "low";
      const { rows, capped } = await fetchAllPages<InventoryRow>("/inventory/variants", {
        q: searchRef.current.trim(),
        lowStock: lowStock ? "1" : undefined,
        shopCode: shopKey,
      });
      if (rows.length === 0) {
        message.info(lowStock ? "Nothing is low on stock." : "No SKUs to export.");
        return;
      }
      await downloadInventoryExcel(rows, shopKey, lowStock);
      if (capped) message.warning(`Export limited to the first ${rows.length} SKUs.`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Could not export inventory.");
    } finally {
      setExporting(false);
    }
  }, [shopKey, message]);

  const handlePrintSingle = useCallback((item: BarcodePrintItem) => {
    setPrintItems([item]);
    setPrintModalOpen(true);
  }, []);

  const columns: AppTableColumn[] = useMemo(
    () => [
      {
        key: "_select",
        label: (
          <input
            type="checkbox"
            title="Select all on page"
            aria-label="Select all on page"
            className={styles.selectCheckbox}
            onChange={(e) => {
              const rows = pageRowsRef.current;
              rows.forEach((r) => {
                if (e.target.checked) selectionRef.current.add(r.id);
                else selectionRef.current.delete(r.id);
              });
              bumpSelection();
            }}
          />
        ),
        width: 48,
        align: "center",
        render: (_, row) => {
          const r = row as InventoryRow;
          return (
            <input
              type="checkbox"
              title="Select row"
              aria-label="Select row"
              className={styles.selectCheckbox}
              checked={selectionRef.current.has(r.id)}
              onChange={(e) => {
                if (e.target.checked) selectionRef.current.add(r.id);
                else selectionRef.current.delete(r.id);
                bumpSelection();
              }}
              onClick={(e) => e.stopPropagation()}
            />
          );
        },
      },
      {
        key: "item",
        label: "Item",
        minWidth: 220,
        render: (_, row) => {
          const r = row as InventoryRow;
          const detail = [r.variantName, r.category?.replace(/_/g, " ")].filter(Boolean).join(" · ");
          return (
            <div className={styles.item}>
              <div className={styles.itemName} title={r.productName}>
                {r.productName}
              </div>
              {detail ? <div className={styles.cellMeta}>{detail}</div> : null}
            </div>
          );
        },
      },
      {
        key: "codes",
        label: "Barcode",
        minWidth: 150,
        render: (_, row) => {
          const r = row as InventoryRow;
          const barcode = String(r.barcode ?? "").trim();
          const sku = String(r.sku ?? "").trim();
          return (
            <div>
              <div className={styles.barcode} title={barcode || undefined}>
                {barcode || "–"}
              </div>
              {sku ? <div className={styles.cellMeta}>SKU {sku}</div> : null}
            </div>
          );
        },
      },
      {
        key: "quantity",
        label: "In stock",
        width: 130,
        align: "right",
        render: (_, row) => {
          const r = row as InventoryRow;
          const state = stockStateOf(r.quantity, r.minStock);
          return (
            <div>
              <div className={styles.qty}>
                {qtyFormat.format(Number(r.quantity) || 0)} {r.unit ?? "PC"}
              </div>
              <div className={`${styles.cellMeta} ${styles[`state_${state}`]}`}>
                {STOCK_STATE_LABEL[state]}
              </div>
            </div>
          );
        },
      },
      {
        key: "minStock",
        label: "Alert at",
        width: 100,
        align: "right",
        render: (_, row) => {
          const r = row as InventoryRow;
          return r.minStock == null ? (
            <span className={styles.cellMeta} title="No low-stock alert set">
              –
            </span>
          ) : (
            <span className={styles.alertAt}>
              {qtyFormat.format(Number(r.minStock))} {r.unit ?? "PC"}
            </span>
          );
        },
      },
      {
        key: "_edit",
        label: "",
        width: 72,
        align: "center",
        render: (_, row) => {
          const r = row as InventoryRow;
          const label = [r.productName, r.variantName].filter(Boolean).join(" · ");
          return (
            <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
              <button
                type="button"
                className="inventory-edit-link"
                aria-label={label ? `Edit ${label}` : "Edit variant"}
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/inventory/${r.id}`, { scroll: false } as Parameters<typeof router.push>[1]);
                }}
              >
                <Pencil size={16} strokeWidth={2} />
              </button>
              {r.barcode && (
                <button
                  type="button"
                  className="inventory-edit-link"
                  aria-label={`Print barcode for ${label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrintSingle({
                      id: r.id,
                      productName: r.productName,
                      variantName: r.variantName,
                      barcode: r.barcode,
                      price: r.price,
                    });
                  }}
                >
                  <Printer size={16} strokeWidth={2} />
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [router, handlePrintSingle],
  );

  const fetchFn = useMemo(() => {
    const baseUrl = getApiBaseUrl();
    return ({ page, pageSize }: { page: number; pageSize: number }) => {
      const u = new URL(
        `${baseUrl}/inventory/variants`,
        typeof window !== "undefined" ? window.location.origin : "http://localhost",
      );
      u.searchParams.set("page", String(page));
      u.searchParams.set("size", String(pageSize));
      const q = searchRef.current.trim();
      if (q) u.searchParams.set("q", q);
      if (stockFilterRef.current === "low") u.searchParams.set("lowStock", "1");
      if (shopKey) u.searchParams.set("shopCode", shopKey);
      return fetch(u.toString(), {
        headers: { ...getAuthHeaders(), Accept: "application/json" },
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(await r.text().catch(() => r.statusText));
          return r.json();
        })
        .then((json) => ({
          data: Array.isArray(json.data) ? json.data : [],
          lastPage: Number(json.last_page ?? 1),
        }));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopKey]);

  const handleCloneCatalogFromFactory = useCallback(() => {
    if (!shopKey || isFactory) return;
    modal.confirm({
      title: "Copy the factory catalog?",
      content:
        "Adds the factory's products, categories, prices and barcodes to this shop. Items that already exist are updated, not duplicated, so it is safe to run again. Large catalogs can take a few minutes, so keep this tab open.",
      okText: "Start copy",
      cancelText: "Cancel",
      width: 480,
      onOk: async () => {
        setCloneCatalogBusy(true);
        const BATCH = 6;
        let skip = 0;
        const acc = { productsCreated: 0, productsUpdated: 0, variantsCreated: 0, variantsUpdated: 0 };
        const MSG_KEY = "clone-catalog-progress";
        try {
          let finished = false;
          while (!finished) {
            message.loading({ key: MSG_KEY, content: `Copying catalog… (${skip} products started)`, duration: 0 });
            const res = await apiFetchLong("/inventory/clone-catalog-from-factory", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ skip, take: BATCH }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              message.destroy(MSG_KEY);
              message.error(typeof data?.message === "string" ? data.message : "Could not copy catalog.");
              return;
            }
            acc.productsCreated += Number(data?.productsCreated ?? 0);
            acc.productsUpdated += Number(data?.productsUpdated ?? 0);
            acc.variantsCreated += Number(data?.variantsCreated ?? 0);
            acc.variantsUpdated += Number(data?.variantsUpdated ?? 0);
            const total = Number(data?.totalFactoryProducts ?? 0);
            const next = Number(data?.nextSkip ?? skip);
            message.loading({ key: MSG_KEY, content: `Copying catalog… ${Math.min(next, total)} / ${total} factory products`, duration: 0 });
            if (data?.completed) { finished = true; } else { skip = next; }
          }
          message.destroy(MSG_KEY);
          message.success(`Catalog synced. New variants: ${acc.variantsCreated}. Updated: ${acc.variantsUpdated}. Reloading…`);
          window.setTimeout(() => window.location.reload(), 800);
        } catch {
          message.destroy(MSG_KEY);
          message.error("Network error while copying catalog.");
        } finally {
          setCloneCatalogBusy(false);
        }
      },
    });
  }, [shopKey, isFactory, message, modal]);

  const handlePurgeShopCatalog = useCallback(() => {
    if (!shopKey || isFactory) return;
    modal.confirm({
      title: "Delete all products for this shop?",
      content:
        "This permanently removes every product, variant, and stock record for the shop you have selected in the header. Orders and bills are kept (they are tax records), and shared categories stay. This cannot be undone.",
      okText: "Delete everything",
      okType: "danger",
      cancelText: "Cancel",
      width: 520,
      onOk: async () => {
        const typed = window.prompt(`Type the shop code "${shopKey}" to confirm`);
        if (typed?.trim() !== shopKey) {
          message.warning("Shop code did not match. Nothing was deleted.");
          return;
        }
        setPurgeCatalogBusy(true);
        try {
          const res = await apiFetch("/inventory/purge-shop-catalog", {
            method: "POST",
            body: JSON.stringify({ confirmShopCode: shopKey }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            message.error(typeof data?.message === "string" ? data.message : "Could not delete catalog.");
            return;
          }
          message.success("Shop catalog cleared. Reloading…");
          window.setTimeout(() => window.location.reload(), 600);
        } catch {
          message.error("Network error while deleting catalog.");
        } finally {
          setPurgeCatalogBusy(false);
        }
      },
    });
  }, [shopKey, isFactory, message, modal]);

  const handlePrintAllFiltered = useCallback(async () => {
    if (!shopKey) return;
    setIsPrintingAll(true);
    try {
      const baseUrl = getApiBaseUrl();
      const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
      const allRows: { id: string; productName?: string; variantName?: string; barcode?: string; price?: number }[] = [];
      const pageSize = 100;
      for (let page = 1; page <= 500; page++) {
        const u = new URL(`${baseUrl}/inventory/variants`, origin);
        u.searchParams.set("page", String(page));
        u.searchParams.set("size", String(pageSize));
        const res = await fetch(u.toString(), { headers: { ...getAuthHeaders(), Accept: "application/json" } });
        if (!res.ok) throw new Error("Failed to fetch products for printing");
        const json = await res.json() as { data?: typeof allRows; last_page?: number };
        const chunk = Array.isArray(json.data) ? json.data : [];
        if (chunk.length === 0 && page === 1) { message.warning("No products found to print."); return; }
        allRows.push(...chunk);
        if (page >= Math.max(1, json.last_page ?? page)) break;
      }
      const items = allRows.filter((r) => !!r.barcode).map((r) => ({
        productName: r.productName ?? "",
        variantName: r.variantName,
        barcode: r.barcode as string,
        price: Number(r.price) || 0,
      }));
      if (items.length === 0) { message.warning("No variants in this shop have barcodes to print."); return; }
      const ok = openPrintableBarcodes(items);
      if (!ok) message.error("The print window was blocked. Allow pop-ups to print.");
    } catch (e) {
      message.error(String(e));
    } finally {
      setIsPrintingAll(false);
    }
  }, [shopKey, message]);

  const handleDeleteSelected = useCallback(() => {
    if (!shopKey || isFactory) return;
    const ids = [...selectionRef.current];
    if (ids.length === 0) { message.warning("Select at least one row using the checkboxes."); return; }
    modal.confirm({
      title: `Delete ${ids.length} selected variant(s)?`,
      content: "POS order lines for these variants are removed. Products with no variants left are deleted; empty categories may be removed. This cannot be undone.",
      okText: "Delete selected",
      okType: "danger",
      cancelText: "Cancel",
      width: 480,
      onOk: async () => {
        setDeleteSelectedBusy(true);
        try {
          const res = await apiFetch("/inventory/variants/bulk-delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ variantIds: ids }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            message.error(
              typeof data?.message === "string"
                ? data.message
                : Array.isArray(data?.message)
                  ? data.message.join(", ")
                  : "Could not delete selected variants.",
            );
            return;
          }
          selectionRef.current.clear();
          bumpSelection();
          const vr = data?.variantsRemoved ?? ids.length;
          const pr = data?.productsRemoved;
          message.success(`Removed ${vr} variant(s)${pr ? ` and ${pr} empty product(s)` : ""}.`);
        } catch {
          message.error("Network error while deleting variants.");
        } finally {
          setDeleteSelectedBusy(false);
        }
      },
    });
  }, [shopKey, isFactory, message, modal]);

  return (
    <div className={styles.root}>
      {/* Row 1: title + everyday actions; rare/destructive shop actions live under "More". */}
      <PageHeader
        className="mb-4"
        title="Stock"
        description="One row per variant: quantities, low-stock alerts, barcodes and refills."
        actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="rounded-lg"
            icon={<Download size={16} />}
            onClick={() => void handleExport()}
            loading={exporting}
          >
            {stockFilter === "low" ? "Export low stock" : "Export"}
          </Button>
          <Button
            className="rounded-lg"
            icon={<Printer size={16} />}
            onClick={handlePrintAllFiltered}
            loading={isPrintingAll}
          >
            Print Barcodes
          </Button>
          {!shopsLoading && !isFactory && (
            <>
              <Button
                type="primary"
                className="font-medium"
                icon={<PackagePlus size={16} />}
                onClick={() => setRefillModalOpen(true)}
              >
                Request Refill
              </Button>
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    {
                      key: "copy",
                      icon: <Copy size={16} />,
                      label: "Copy factory catalog",
                      disabled: cloneCatalogBusy,
                    },
                    ...(authUser?.role === "SUPER_ADMIN"
                      ? [
                          { type: "divider" as const },
                          {
                            key: "purge",
                            icon: <Trash2 size={16} />,
                            label: "Delete all products",
                            danger: true,
                            disabled: purgeCatalogBusy,
                          },
                        ]
                      : []),
                  ],
                  onClick: ({ key }) => {
                    if (key === "copy") handleCloneCatalogFromFactory();
                    if (key === "purge") handlePurgeShopCatalog();
                  },
                }}
              >
                <Button
                  aria-label="More inventory actions"
                  icon={<MoreHorizontal size={16} />}
                  loading={cloneCatalogBusy || purgeCatalogBusy}
                />
              </Dropdown>
            </>
          )}
        </div>
        }
      />

      {/* Row 2: filters on the left; bulk delete appears only once rows are selected. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--pearl-bush)] pb-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Segmented<StockFilter>
            aria-label="Stock filter"
            options={[
              { label: "All SKUs", value: "all" },
              { label: "Low stock", value: "low" },
            ]}
            value={stockFilter}
            onChange={changeStockFilter}
          />
          <Input
            id="inventory-search"
            // Fixed width (inline: antd's wrapper ignored the responsive class and went full width).
            style={{ width: 320, maxWidth: "100%" }}
            className="rounded-lg"
            allowClear
            placeholder="Search product, variant or barcode"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            prefix={<Search size={16} className="text-[var(--text-muted)]" aria-hidden />}
          />
        </div>
        {!shopsLoading && !isFactory && isAtLeastManager(authUser?.role) && selectionRef.current.size > 0 && (
          <Button
            danger
            type="primary"
            className="font-medium"
            icon={<Trash2 size={16} />}
            loading={deleteSelectedBusy}
            onClick={() => void handleDeleteSelected()}
          >
            Delete selected ({selectionRef.current.size})
          </Button>
        )}
      </div>

      <div className={styles.tableSlot}>
        <DataTable
          columns={columns}
          fetchFn={fetchFn}
          filterKey={filterKey}
          pageSize={PAGE_SIZE}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          maxBodyHeight={520}
          onRowClick={(row) => {
            const r = row as InventoryRow;
            if (r?.id) router.push(`/inventory/${r.id}`);
          }}
          onVisibleRowsChange={(rows) => {
            pageRowsRef.current = rows as InventoryRow[];
          }}
          emptyTitle={stockFilter === "low" ? "Nothing needs restocking" : "No stock found"}
          emptyDescription={
            stockFilter === "low"
              ? "Every SKU is above its minimum stock level."
              : "Inventory from the Factory will appear here once products are added or transferred."
          }
          emptyIcon={<PackageSearch size={28} strokeWidth={1.35} aria-hidden />}
        />
      </div>

      <BarcodePrintModal
        open={printModalOpen}
        items={printItems}
        onCancel={() => setPrintModalOpen(false)}
      />
      <RefillRequestModal
        open={refillModalOpen}
        onClose={() => setRefillModalOpen(false)}
      />
    </div>
  );
}
