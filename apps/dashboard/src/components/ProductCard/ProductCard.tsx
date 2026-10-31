import styles from "./ProductCard.module.css";

export type ProductVariant = {
  id: string;
  name: string;
  price: number;
  costPrice: number | null;
  barcode: string;
  sku: string | null;
  hsnCode: string | null;
  quantity: number;
  minStock: number | null;
  unit: string | null;
};

export type ProductCategory = {
  id: string;
  name: string;
  createdAt?: string;
};

export type ProductWithRelations = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  shopCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category: ProductCategory | null;
  variants?: ProductVariant[] | null;
};

export type ProductCardProduct = {
  id: string;
  name: string;
  price: number;
  unit: string;
  category?: string | null;
  imageUrl?: string | null;
};

export type ProductBadge = "SEASONAL" | null;

const POS_PLACEHOLDER =
  "https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?w=200&h=200&fit=crop";

export function productToBillLine(
  product: ProductWithRelations,
): ProductCardProduct {
  const v = product.variants?.[0];
  return {
    id: product.id,
    name: product.name,
    price: v?.price ?? 0,
    unit: v?.unit ?? "PC",
    category: product.category?.name ?? null,
    imageUrl: null,
  };
}

function formatInr(amount: number) {
  const n = Number(amount);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

type DetailProps = {
  product: ProductWithRelations;
};

export default function ProductDetailCard({ product }: DetailProps) {
  const variants = product.variants ?? [];

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>{product.name}</h2>
          <span
            className={
              product.isActive ? styles.badgeActive : styles.badgeInactive
            }
          >
            {product.isActive ? "Active" : "Inactive"}
          </span>
        </div>
        {product.category && (
          <span className={styles.category}>{product.category.name}</span>
        )}
        {product.description && (
          <p className={styles.description}>{product.description}</p>
        )}
        <p className={styles.meta}>
          Shop <span className={styles.mono}>{product.shopCode}</span>
        </p>
      </div>

      <div className={styles.variants}>
        <h3 className={styles.variantsTitle}>Variants</h3>
        {variants.length === 0 ? (
          <p className={styles.emptyVariants}>No variants</p>
        ) : (
          <ul className={styles.variantList}>
            {variants.map((v) => (
              <li key={v.id} className={styles.variantRow}>
                <div className={styles.variantMain}>
                  <span className={styles.variantName}>{v.name}</span>
                  <span className={styles.price}>{formatInr(v.price)}</span>
                </div>
                <div className={styles.variantMeta}>
                  <span>
                    Stock {v.quantity} {v.unit ?? "-"}
                  </span>
                  {v.hsnCode && (
                    <span className={styles.hsn}>HSN {v.hsnCode}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

type PosProps = {
  product: ProductWithRelations;
  badge?: ProductBadge;
  onAdd: (line: ProductCardProduct) => void;
};

/** Compact tile for Billing POS - first variant price; Add to bill. */
export function ProductCard({ product, badge, onAdd }: PosProps) {
  const line = productToBillLine(product);
  const priceLabel = formatInr(line.price);
  const imgSrc = line.imageUrl || POS_PLACEHOLDER;

  return (
    <div className="relative flex w-full min-w-0 flex-col self-start rounded-xl border border-[var(--pearl-bush)] bg-[var(--parchment)] shadow-sm transition-colors hover:border-[var(--ochre-200)] [height:fit-content] max-h-none">
      {badge === "SEASONAL" && (
        <span className="absolute right-2 top-2 z-10 rounded-full border border-[var(--ochre-200)] bg-[var(--ochre-100)] px-2 py-0.5 text-xs font-medium text-[var(--ochre-600)]">
          Seasonal
        </span>
      )}
      <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-t-xl bg-[var(--linen-95)]">
        <img
          src={imgSrc}
          alt={product.name || "Product"}
          className="block h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="flex flex-col gap-2 rounded-b-xl bg-[var(--parchment)] p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-[var(--text-primary)]">
          {product.name}
        </h3>
        <p className="text-base font-bold text-[var(--ochre-600)]">
          {priceLabel}
        </p>
        {product.variants?.[0] && (
          <p className="text-xs text-[var(--text-muted)]">
            {product.variants[0].name}
            {(product.variants?.length ?? 0) > 1
              ? ` · +${(product.variants?.length ?? 1) - 1} more`
              : ""}
          </p>
        )}
        <button
          type="button"
          onClick={() => onAdd(line)}
          className="w-full rounded-lg bg-[var(--ochre-500)] py-2.5 text-sm font-semibold text-[var(--on-primary)] transition-colors hover:bg-[var(--ochre-600)]"
        >
          Add
        </button>
      </div>
    </div>
  );
}
