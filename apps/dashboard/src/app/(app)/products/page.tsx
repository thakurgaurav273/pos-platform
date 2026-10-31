"use client";

import { useState } from "react";
import { ContentSkeleton } from "@/components/ContentSkeleton/ContentSkeleton";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { ProductsPageContent } from "@/components/ProductsPage/ProductsPageContent";
import { useShop } from "@/contexts/ShopContext";

export default function ProductsPage() {
  const { effectiveShopCode } = useShop();
  const shopCode =
    effectiveShopCode ||
    process.env.NEXT_PUBLIC_API_DEFAULT_SHOP_CODE ||
    "";

  const [listVersion, setListVersion] = useState(0);

  if (!shopCode) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <PageHeader
          title="Products"
          description="Select a shop in the header to load the catalog."
        />
        <ContentSkeleton variant="rows" rowCount={8} />
      </div>
    );
  }

  return (
    <ProductsPageContent
      shopCode={shopCode}
      refreshKey={listVersion}
      onRefresh={() => setListVersion((v) => v + 1)}
    />
  );
}
