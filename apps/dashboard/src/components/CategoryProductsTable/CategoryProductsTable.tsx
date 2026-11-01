"use client";

import { memo, useMemo, useState } from "react";
import { Input } from "antd";
import { LayoutGrid, Search } from "lucide-react";
import { DataTable, type AppTableColumn } from "@/components/DataTable/DataTable";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { dedupeInFlight, getApiBaseUrl, getAuthHeaders } from "@/lib/api";
import styles from "./CategoryProductsTable.module.css";

type ApiVariant = { id: string; quantity: number; price: number };
type ApiProduct = { id: string; name: string; variants: ApiVariant[] };
type PageBody = { data: ApiProduct[]; last_page: number };

type TabRow = {
  productId: string;
  name: string;
  stock: number;
  fromPrice: number;
  firstVariantId: string | null;
};

const PAGE_SIZE = 40;

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function mapProductToRow(p: ApiProduct): TabRow {
  const stock = p.variants.reduce((s, v) => s + v.quantity, 0);
  const minPrice = p.variants.length > 0 ? Math.min(...p.variants.map((v) => v.price)) : 0;
  return {
    productId: p.id,
    name: p.name,
    stock,
    fromPrice: minPrice,
    firstVariantId: p.variants[0]?.id ?? null,
  };
}

export type CategoryProductsTableProps = {
  categoryId: string;
  refreshKey: number;
  onOpenVariant: (variantId: string) => void;
};

function CategoryProductsTableInner({
  categoryId,
  refreshKey,
  onOpenVariant,
}: CategoryProductsTableProps) {
  const [query, setQuery] = useState("");
  const search = useDebouncedValue(query.trim(), 400);
  const filterKey = `${categoryId}|${search}|${refreshKey}`;

  const columns: AppTableColumn[] = useMemo(
    () => [
      {
        key: "name",
        label: "Product",
        field: "name",
        minWidth: 200,
      },
      {
        key: "stock",
        label: "Stock",
        field: "stock",
        width: 100,
        align: "right",
        render: (val) => (
          <span className="category-products-num">
            {(Number(val) || 0).toLocaleString("en-IN")}
          </span>
        ),
      },
      {
        key: "fromPrice",
        label: "From price",
        field: "fromPrice",
        width: 120,
        align: "right",
        render: (val) => (
          <span className="category-products-num">
            {inr.format(Number(val) || 0)}
          </span>
        ),
      },
      {
        key: "firstVariantId",
        label: "Inventory",
        field: "firstVariantId",
        minWidth: 120,
        render: (val) => {
          const id = val as string | null;
          if (!id) return <span className="category-products-dash">-</span>;
          return (
            <button
              type="button"
              className="category-products-link"
              onClick={(e) => {
                e.preventDefault();
                onOpenVariant(id);
              }}
            >
              Open variant
            </button>
          );
        },
      },
    ],
    [onOpenVariant],
  );

  const baseUrl = getApiBaseUrl();

  const fetchFn = useMemo(
    () =>
      ({ page, pageSize }: { page: number; pageSize: number }) => {
        const u = new URL(
          `${baseUrl}/category/${categoryId}/products`,
          typeof window !== "undefined" ? window.location.origin : "http://localhost",
        );
        u.searchParams.set("page", String(page));
        u.searchParams.set("size", String(pageSize));
        if (search) u.searchParams.set("q", search);
        const dedupeKey = `GET:/category/${categoryId}/products:p${page}:s${pageSize}:q${search}`;
        return dedupeInFlight(dedupeKey, async () => {
          const r = await fetch(u.toString(), {
            headers: { ...getAuthHeaders(), Accept: "application/json" },
          });
          if (!r.ok) throw new Error(await r.text().catch(() => r.statusText));
          const body = (await r.json()) as PageBody;
          return {
            data: (body.data ?? []).map(mapProductToRow),
            lastPage: body.last_page ?? 1,
          };
        });
      },
    [baseUrl, categoryId, search],
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <Input
          allowClear
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products in this category"
          prefix={<Search size={16} className="text-[var(--text-muted)]" aria-hidden />}
          className={styles.search}
          aria-label="Search products in this category"
        />
      </div>
      <div className={styles.tableSlot}>
        <DataTable
          columns={columns}
          fetchFn={fetchFn}
          filterKey={filterKey}
          pageSize={PAGE_SIZE}
          maxBodyHeight="none"
          className={styles.table}
          emptyTitle={search ? "No products match" : "No products here"}
          emptyDescription={
            search ? `Nothing in this category matches “${search}”.` : undefined
          }
          emptyIcon={<LayoutGrid size={28} strokeWidth={1.35} aria-hidden />}
        />
      </div>
    </div>
  );
}

export const CategoryProductsTable = memo(CategoryProductsTableInner);
