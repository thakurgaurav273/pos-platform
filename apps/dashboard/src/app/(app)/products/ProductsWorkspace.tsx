"use client";

import { Boxes, Package } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { ContentSkeleton } from "@/components/ContentSkeleton/ContentSkeleton";
import InventoryTable from "@/components/InventoryTable/InventoryTable";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { PageTabs, type PageTab } from "@/components/PageTabs/PageTabs";
import { ProductsPageContent } from "@/components/ProductsPage/ProductsPageContent";
import { useAuth } from "@/contexts/AuthContext";
import { useShop } from "@/contexts/ShopContext";

type Tab = "products" | "stock";

const TABS: (PageTab & { key: Tab })[] = [
  { key: "products", label: "Products", href: "/products", icon: Package },
  { key: "stock", label: "Stock", href: "/products?tab=stock", icon: Boxes },
];

/**
 * Products (one row per product: what you sell) and Stock (one row per variant: how
 * much you have) are two views of one catalog, so they share a page and a sidebar entry.
 * The tab is in the URL: /products or /products?tab=stock.
 */
export default function ProductsWorkspace() {
  const searchParams = useSearchParams();
  const { permissions } = useAuth();
  const { effectiveShopCode } = useShop();
  const shopCode = effectiveShopCode || process.env.NEXT_PUBLIC_API_DEFAULT_SHOP_CODE || "";
  const [listVersion, setListVersion] = useState(0);

  // Unknown permissions (an older saved session) show both tabs; each API still checks.
  const canProducts = permissions?.canAccessProducts ?? true;
  const canStock = permissions?.canAccessInventory ?? true;

  const wanted: Tab = searchParams.get("tab") === "stock" ? "stock" : "products";
  const tab: Tab =
    wanted === "stock" ? (canStock ? "stock" : "products") : canProducts ? "products" : "stock";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      {canProducts && canStock ? (
        <PageTabs label="Products sections" tabs={TABS} active={tab} />
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {tab === "stock" ? (
          <InventoryTable initialLowStock={searchParams.get("filter") === "low-stock"} />
        ) : !shopCode ? (
          <>
            <PageHeader
              title="Products"
              description="Select a shop in the header to load the catalog."
            />
            <ContentSkeleton variant="rows" rowCount={8} />
          </>
        ) : (
          <ProductsPageContent
            shopCode={shopCode}
            refreshKey={listVersion}
            onRefresh={() => setListVersion((v) => v + 1)}
          />
        )}
      </div>
    </div>
  );
}
