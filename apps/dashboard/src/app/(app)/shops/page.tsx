'use client';

import type { Shop } from "@/lib/types/shop";
import useFetch from "@/hooks/useFetch";
import ShopCard from "@/components/ShopCard/ShopCard";
import { ContentSkeleton } from "@/components/ContentSkeleton/ContentSkeleton";
import { Button } from "antd";
import { PlusCircle, Store } from "lucide-react";
import CreateShopWizard from "./CreateShopWizard";
import { useState } from "react";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { PageHeader } from "@/components/PageHeader/PageHeader";

export default function ShopsPage() {
  const { data, loading, fetchApi } = useFetch('/shops', { method: 'GET' });
  const [wizardOpen, setWizardOpen] = useState(false);

  const shops = ((data as Shop[]) || []).filter(s => !s.isFactory);

  return (
    <div className="p-2">
      <PageHeader
        className="mb-8"
        title="Shops"
        description="Manage retail locations and inventory templates."
        actions={
          <Button
            type="primary"
            icon={<PlusCircle size={16} />}
            onClick={() => setWizardOpen(true)}
          >
            Add New Shop
          </Button>
        }
      />

      {loading && !data ? (
        <ContentSkeleton variant="card-grid" gridItems={6} />
      ) : shops.length === 0 ? (
        <EmptyState 
          message="No shops found" 
          description="Click the button above to create your first retail location."
          icon={<Store size={48} />}
        />
      ) : (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
          gap: 24 
        }}>
          {shops.map((shop) => (
            <ShopCard
              key={shop.id}
              shop={shop}
              onDeleted={() => void fetchApi()}
              onUpdated={() => void fetchApi()}
            />
          ))}
        </div>
      )}

      <CreateShopWizard 
        open={wizardOpen}
        onCancel={() => setWizardOpen(false)}
        onSuccess={() => {
          setWizardOpen(false);
          fetchApi(); // Refresh the list
        }}
      />
    </div>
  );
}
