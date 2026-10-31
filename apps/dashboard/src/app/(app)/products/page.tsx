import { Suspense } from "react";
import { ContentSkeleton } from "@/components/ContentSkeleton/ContentSkeleton";
import ProductsWorkspace from "./ProductsWorkspace";

export default function ProductsPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* ProductsWorkspace reads ?tab= via useSearchParams, which needs a Suspense boundary */}
      <Suspense fallback={<ContentSkeleton variant="rows" rowCount={8} />}>
        <ProductsWorkspace />
      </Suspense>
    </div>
  );
}
