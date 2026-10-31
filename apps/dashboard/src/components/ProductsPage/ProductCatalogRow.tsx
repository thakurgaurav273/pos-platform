"use client";

import { App, Popconfirm } from "antd";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import type { ProductVariant, ProductWithRelations } from "@/components/ProductCard/ProductCard";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { isAtLeastManager } from "@/lib/rolePermissions";
import { STOCK_STATE_LABEL as STATE_LABEL, stockStateOf, type StockState } from "@/lib/stockState";

import styles from "./ProductCatalogRow.module.css";

/** Variant chips shown before "+N more": fewer when the list is narrow, so rows stay one line. */
const NARROW_CHIPS = 2;
const WIDE_CHIPS = 3;

const qtyFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });
const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const inrPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₹75", or "₹47.50" when there are paise (whole rupees would hide them). */
function formatInr(amount: number): string {
  const n = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return (Number.isInteger(n) ? inrWhole : inrPaise).format(n);
}

/** A variant's edit page; Back on that page returns here rather than to the Stock tab. */
function variantHref(variantId: string): string {
  return `/inventory/${encodeURIComponent(variantId)}?from=products`;
}

function stockState(v: ProductVariant): StockState {
  return stockStateOf(v.quantity, v.minStock);
}

/** "In stock", "Low stock", "1 out · 2 low", … */
function stockSummary(states: StockState[]): { state: StockState; text: string } {
  const out = states.filter((s) => s === "out").length;
  const low = states.filter((s) => s === "low").length;
  const state: StockState = out > 0 ? "out" : low > 0 ? "low" : "ok";
  if (states.length === 1 || out === states.length || state === "ok") {
    return { state, text: STATE_LABEL[state] };
  }
  const parts = [out > 0 ? `${out} out` : null, low > 0 ? `${low} low` : null];
  return { state, text: parts.filter(Boolean).join(" · ") };
}

/** Column titles for the product list; uses the same grid as each row. */
export function ProductCatalogHeader() {
  return (
    <div className={`${styles.grid} ${styles.header}`} aria-hidden>
      <span>Product</span>
      <span>Variants</span>
      <span className={styles.right}>Stock</span>
      <span className={styles.right}>Price</span>
      <span />
    </div>
  );
}

type Props = {
  product: ProductWithRelations;
  onProductDeleted?: () => void;
};

export function ProductCatalogRow({ product, onProductDeleted }: Props) {
  const { message } = App.useApp();
  const { user } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const variants = product.variants ?? [];
  const states = variants.map(stockState);
  const summary = stockSummary(states);
  const single = variants.length === 1;
  const first = variants[0];
  const editHref = first ? variantHref(first.id) : null;

  // Stock is totalled per unit: adding kilos to pieces would mean nothing.
  const byUnit = new Map<string, number>();
  for (const v of variants) {
    const u = v.unit ?? "PC";
    byUnit.set(u, (byUnit.get(u) ?? 0) + (Number(v.quantity) || 0));
  }
  const unit = byUnit.size === 1 ? [...byUnit.keys()][0] : null;
  const stockLabel = [...byUnit]
    .map(([u, q]) => `${qtyFormat.format(q)} ${u}`)
    .join(" · ");

  const prices = variants.map((v) => Number(v.price)).filter(Number.isFinite);
  const minP = prices.length ? Math.min(...prices) : 0;
  const maxP = prices.length ? Math.max(...prices) : 0;
  const priceLabel =
    prices.length === 0
      ? "–"
      : minP === maxP
        ? formatInr(minP)
        : `${formatInr(minP)}–${formatInr(maxP)}`;
  // Pieces and packs are the default; say so only for weight or volume pricing.
  const priceBasis = single && unit && unit !== "PC" ? `per ${unit}` : null;

  const categoryName = product.category?.name?.replace(/_/g, " ");

  const onDelete = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch(`/products/${product.id}`, {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(
          typeof payload?.message === "string"
            ? payload.message
            : "Could not delete product",
        );
        return;
      }
      message.success("Product deleted");
      onProductDeleted?.();
    } catch {
      message.error("Failed to delete product");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`${styles.grid} ${styles.row} ${product.isActive ? "" : styles.rowInactive}`.trim()}>
      <div className={styles.product}>
        <div className={styles.nameLine}>
          {editHref ? (
            <Link href={editHref} className={styles.name} title={product.name} scroll={false}>
              {product.name}
            </Link>
          ) : (
            <span className={styles.name} title={product.name}>
              {product.name}
            </span>
          )}
          {product.isActive ? null : <span className={styles.inactive}>Inactive</span>}
        </div>
        <div className={styles.meta}>
          {categoryName ? <span className={styles.category}>{categoryName}</span> : "Uncategorised"}
        </div>
      </div>

      <div className={styles.variants}>
        {variants.length === 0 ? (
          <span className={styles.meta}>No variants</span>
        ) : (
          <ul className={styles.chips} aria-label="Variants">
            {variants.slice(0, WIDE_CHIPS).map((v, i) => {
              const qty = `${qtyFormat.format(Number(v.quantity) || 0)} ${v.unit ?? "PC"}`;
              const details = `${v.name} · ${formatInr(v.price)} · ${qty} · ${STATE_LABEL[states[i]]}`;
              return (
                <li key={v.id} className={i >= NARROW_CHIPS ? styles.wideOnly : undefined}>
                  <Link
                    href={variantHref(v.id)}
                    className={styles.chip}
                    scroll={false}
                    title={details}
                    aria-label={`Edit variant: ${details}`}
                  >
                    <span className={`${styles.dot} ${styles[`dot_${states[i]}`]}`} aria-hidden />
                    <span className={styles.chipName}>{v.name}</span>
                    {/* With one variant the Price column already says it */}
                    {single ? null : <span className={styles.chipPrice}>{formatInr(v.price)}</span>}
                  </Link>
                </li>
              );
            })}
            {variants.length > NARROW_CHIPS ? (
              <li className={`${styles.more} ${styles.narrowOnly}`}>
                +{variants.length - NARROW_CHIPS} more
              </li>
            ) : null}
            {variants.length > WIDE_CHIPS ? (
              <li className={`${styles.more} ${styles.wideOnly}`}>
                +{variants.length - WIDE_CHIPS} more
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <div className={`${styles.stock} ${styles.right}`}>
        {variants.length === 0 ? (
          <span className={styles.meta}>–</span>
        ) : (
          <>
            <div className={styles.value} title={stockLabel}>
              {stockLabel}
            </div>
            <div className={`${styles.status} ${styles[`status_${summary.state}`]}`}>
              {summary.text}
            </div>
          </>
        )}
      </div>

      <div className={`${styles.price} ${styles.right}`}>
        <div className={styles.value}>{priceLabel}</div>
        {priceBasis ? <div className={styles.meta}>{priceBasis}</div> : null}
      </div>

      <div className={styles.actions}>
        {editHref ? (
          <Link
            href={editHref}
            className={styles.iconBtn}
            aria-label={`Edit ${product.name}`}
            title="Edit"
            scroll={false}
          >
            <Pencil size={15} strokeWidth={1.9} aria-hidden />
          </Link>
        ) : null}
        {isAtLeastManager(user?.role) ? (
          <Popconfirm
            title="Delete this product?"
            description="This removes the product and its variants. If it appears on past orders, deletion may be blocked."
            onConfirm={() => void onDelete()}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true, loading: deleting }}
          >
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.iconDanger}`}
              aria-label={`Delete ${product.name}`}
              title="Delete"
              disabled={deleting}
            >
              <Trash2 size={15} strokeWidth={1.9} aria-hidden />
            </button>
          </Popconfirm>
        ) : null}
      </div>
    </div>
  );
}
