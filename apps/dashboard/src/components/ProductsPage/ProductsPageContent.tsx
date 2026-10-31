"use client";

import { App, Button, Drawer, Form, Input, InputNumber, Segmented, Select } from "antd";
import { Plus, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  priceInputProps,
  sellingPriceRules,
  UNIT_OPTIONS,
} from "@/lib/catalogFields";

import { useDebouncedValue } from "@/hooks/useDebouncedValue";

import type { ProductWithRelations } from "@/components/ProductCard/ProductCard";
import { ProductCatalogRow } from "./ProductCatalogRow";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { PackageSearch, Inbox } from "lucide-react";
import { ContentSkeleton } from "@/components/ContentSkeleton/ContentSkeleton";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { LoadingDots } from "@/components/LoadingDots/LoadingDots";
import styles from "./ProductsPageContent.module.css";
import { useAuth } from "@/contexts/AuthContext";
import { isAtLeastManager } from "@/lib/rolePermissions";

const PAGE_SIZE = 40;

type Props = {
  shopCode: string;
  refreshKey?: number;
  onRefresh?: () => void;
};

type StatusFilter = "all" | "active" | "inactive";

type ProductsPageResponse = {
  data: ProductWithRelations[];
  page: number;
  size: number;
  total: number;
  last_page: number;
  hasMore: boolean;
};

function isProductsPageResponse(x: unknown): x is ProductsPageResponse {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return Array.isArray(o.data) && typeof o.total === "number";
}

export function ProductsPageContent({
  shopCode,
  refreshKey = 0,
  onRefresh,
}: Props) {
  const { message } = App.useApp();
  const { user } = useAuth();
  // Creating a product sets its price and opening stock: manager or above only (API agrees).
  const canAddProduct = isAtLeastManager(user?.role);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 500);
  const [status, setStatus] = useState<StatusFilter>("all");

  const [items, setItems] = useState<ProductWithRelations[]>([]);
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState(2);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchGenRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const createUnit = Form.useWatch("unit", form) as string | undefined;
  const [categoryOptions, setCategoryOptions] = useState<
    { label: string; value: string }[]
  >([]);

  const fetchPage = useCallback(
    async (page: number) => {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("size", String(PAGE_SIZE));
      const qt = debouncedSearch.trim();
      if (qt) q.set("q", qt);
      if (status === "active") q.set("status", "active");
      if (status === "inactive") q.set("status", "inactive");
      const res = await apiFetch(`/products?${q.toString()}`, {
        method: "GET",
      });
      if (!res.ok) {
        throw new Error(await res.text().catch(() => res.statusText));
      }
      const json: unknown = await res.json();
      if (!isProductsPageResponse(json)) {
        throw new Error("Unexpected response");
      }
      return json;
    },
    [debouncedSearch, status],
  );

  useEffect(() => {
    if (!shopCode) return;
    const rid = ++fetchGenRef.current;
    setInitialLoading(true);
    setLoadError(null);
    setItems([]);
    setHasMore(true);
    setNextPage(2);

    fetchPage(1)
      .then((body) => {
        if (fetchGenRef.current !== rid) return;
        setItems(body.data);
        setTotal(body.total);
        setHasMore(body.hasMore);
        setNextPage(body.page + 1);
      })
      .catch((e: unknown) => {
        if (fetchGenRef.current !== rid) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load products");
        setItems([]);
        setTotal(0);
        setHasMore(false);
      })
      .finally(() => {
        if (fetchGenRef.current === rid) setInitialLoading(false);
      });
  }, [shopCode, refreshKey, fetchPage]);

  const loadMore = useCallback(async () => {
    if (!shopCode || !hasMore || loadingMore || initialLoading) return;
    const genAtStart = fetchGenRef.current;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const body = await fetchPage(nextPage);
      if (fetchGenRef.current !== genAtStart) return;
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const p of body.data) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            merged.push(p);
          }
        }
        return merged;
      });
      setHasMore(body.hasMore);
      setNextPage(body.page + 1);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [shopCode, hasMore, loadingMore, initialLoading, fetchPage, nextPage]);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore || initialLoading) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root, rootMargin: "100px", threshold: 0 },
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [hasMore, initialLoading, loadMore, items.length]);

  useEffect(() => {
    if (createOpen && categoryOptions.length === 0) {
      apiFetch("/category")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setCategoryOptions(
              data.map((c: { name: string; id: string }) => ({
                label: c.name,
                value: c.id,
              })),
            );
          }
        })
        .catch(console.error);
    }
  }, [createOpen, categoryOptions.length]);

  const onFinish = async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      const res = await apiFetch("/products", {
        method: "POST",
        body: JSON.stringify(values),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(
          typeof payload?.message === "string"
            ? payload.message
            : Array.isArray(payload?.message)
              ? payload.message.join(", ")
              : "Could not create product",
        );
        return;
      }
      message.success("Product created!");
      setCreateOpen(false);
      form.resetFields();
      onRefresh?.();
    } catch {
      message.error("Failed to create product");
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className={styles.root}>
      <PageHeader
        title="Products"
        description={
          hasMore
            ? `Showing ${items.length} of ${total} products`
            : `${total} ${total === 1 ? "product" : "products"}`
        }
        actions={
          <>
          <Input
            allowClear
            placeholder="Search products, variants, barcodes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.search}
            prefix={<Search size={16} className="text-[var(--text-muted)]" aria-hidden />}
            aria-label="Search products"
          />
          <Segmented<StatusFilter>
            options={[
              { label: "All", value: "all" },
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
            ]}
            value={status}
            onChange={setStatus}
          />
          {canAddProduct && (
            <Button type="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
              New product
            </Button>
          )}
          </>
        }
      />

      {loadError ? (
        <p className={styles.errorBanner} role="alert">
          {loadError}
        </p>
      ) : null}

      <div ref={scrollRef} className={styles.scroll}>
        {initialLoading ? (
          <div className={styles.initialLoad}>
            <ContentSkeleton variant="rows" rowCount={10} />
          </div>
        ) : total === 0 ? (
          <EmptyState
            message="No products for this shop."
            description="Start by adding your first product to the catalog."
            icon={<Inbox size={40} />}
          />
        ) : items.length === 0 ? (
          <EmptyState
            message="No products match your filters."
            description="Try another search term or change the status filter."
            icon={<PackageSearch size={40} />}
          />
        ) : (
          <>
            <div className={styles.rowStack}>
              {items.map((p) => (
                <ProductCatalogRow
                  key={p.id}
                  product={p}
                  onProductDeleted={() => onRefresh?.()}
                />
              ))}
            </div>
            {hasMore ? (
              <div ref={sentinelRef} className={styles.scrollSentinel} aria-hidden />
            ) : null}
            {loadingMore ? (
              <div className={styles.loadMoreRow}>
                <LoadingDots />
                <span>Loading more…</span>
              </div>
            ) : null}
          </>
        )}
      </div>

      <Drawer
        title="New Product"
        placement="right"
        size="default"
        onClose={() => setCreateOpen(false)}
        open={createOpen}
        destroyOnHidden
        extra={
          <Button
            type="primary"
            onClick={() => form.submit()}
            loading={submitting}
          >
            Save
          </Button>
        }
      >
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="name"
            label="Product Name"
            rules={[{ required: true }]}
          >
            <Input placeholder="e.g., Kaju Katli" />
          </Form.Item>

          <Form.Item
            name="unit"
            label="Sold by"
            rules={[{ required: true, message: "Choose how this product is sold" }]}
            extra="Use KG for sweets sold by weight, PC for pieces or packs. Billing uses this unit."
          >
            <Select placeholder="Select unit" options={UNIT_OPTIONS} />
          </Form.Item>

          <Form.Item
            name="price"
            label={`Price (₹)${createUnit ? ` per ${createUnit}` : ""}`}
            rules={sellingPriceRules}
          >
            <InputNumber
              className="w-full"
              style={{ width: "100%" }}
              {...priceInputProps}
              placeholder="e.g., 200"
            />
          </Form.Item>

          <Form.Item name="categoryId" label="Category">
            <Select
              placeholder="Select a category"
              options={categoryOptions}
              allowClear
            />
          </Form.Item>

          <Form.Item name="variantName" label="Variant label">
            <Input placeholder="e.g. Regular, 500g (optional)" />
          </Form.Item>

          <Form.Item name="quantity" label={`Initial Stock${createUnit ? ` (${createUnit})` : ""}`}>
            <InputNumber
              className="w-full"
              style={{ width: "100%" }}
              min={0}
              max={1_000_000}
              precision={3}
              placeholder="e.g., 100"
            />
          </Form.Item>

          <Form.Item name="sku" label="SKU" extra="Optional. Must be unique in this shop.">
            <Input placeholder="e.g. SWT-RAGI-1KG" />
          </Form.Item>

          <Form.Item
            name="barcode"
            label="Barcode"
            extra="Leave blank to auto-generate. Must be unique in this shop."
          >
            <Input placeholder="Auto-generated" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
