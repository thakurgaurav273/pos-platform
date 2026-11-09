"use client";

import { App, Button, Form, Input, Modal } from "antd";
import { ChevronRight, FileUp, FolderSearch, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { CatalogImportModal } from "@/components/CatalogImport/CatalogImportModal";
import { ContentSkeleton } from "@/components/ContentSkeleton/ContentSkeleton";
import { EmptyState } from "@/components/EmptyState/EmptyState";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import useFetch from "@/hooks/useFetch";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useShop } from "@/contexts/ShopContext";
import { isAtLeastManager } from "@/lib/rolePermissions";

import styles from "./page.module.css";

type CategoryProductSummary = {
  id: string;
  name: string;
  totalStock: number;
};

type CategorySummary = {
  id: string;
  name: string;
  products: CategoryProductSummary[];
  totalStock: number;
};

/** Display only: "dry_fruits" → "Dry fruits". Stored names are left as-is. */
function formatCategoryName(name: string): string {
  const spaced = name.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isCategoryList(data: unknown): data is CategorySummary[] {
  return (
    Array.isArray(data) &&
    data.every(
      (row) =>
        row &&
        typeof row === "object" &&
        "id" in row &&
        "name" in row &&
        "products" in row &&
        "totalStock" in row,
    )
  );
}

export default function CategoriesPage() {
  const { message } = App.useApp();
  const { effectiveShopCode } = useShop();
  const { user } = useAuth();
  const shopCode =
    effectiveShopCode ||
    process.env.NEXT_PUBLIC_API_DEFAULT_SHOP_CODE ||
    "";

  const [listVersion, setListVersion] = useState(0);
  const { data, error, loading } = useFetch(
    shopCode ? "/category" : "",
    { method: "GET" },
    [effectiveShopCode, listVersion],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const onCreate = async (values: { name: string }) => {
    setSubmitting(true);
    try {
      const res = await apiFetch("/category", {
        method: "POST",
        body: JSON.stringify({ name: values.name.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        message.error(
          typeof payload?.message === "string"
            ? payload.message
            : "Could not create category",
        );
        return;
      }
      message.success("Category created");
      setCreateOpen(false);
      form.resetFields();
      setListVersion((v) => v + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const categories = isCategoryList(data) ? data : null;

  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    if (!categories) return [];
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) =>
      formatCategoryName(c.name).toLowerCase().includes(q),
    );
  }, [categories, query]);

  const totals = useMemo(() => {
    if (!categories) return null;
    return {
      categories: categories.length,
      products: categories.reduce((n, c) => n + c.products.length, 0),
    };
  }, [categories]);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Categories"
        description={
          totals ? (
            <>
              {totals.categories} {totals.categories === 1 ? "category" : "categories"} ·{" "}
              {totals.products} {totals.products === 1 ? "product" : "products"}
            </>
          ) : null
        }
        actions={
          (categories && categories.length > 0) || isAtLeastManager(user?.role) ? (
            <div className={styles.toolbar}>
              {categories && categories.length > 0 ? (
                <Input
                  allowClear
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search categories"
                  prefix={<Search className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />}
                  className={styles.search}
                  aria-label="Search categories"
                />
              ) : null}
              {isAtLeastManager(user?.role) && (
                <>
                  <Button
                    icon={<FileUp size={16} strokeWidth={2.25} />}
                    onClick={() => setImportOpen(true)}
                  >
                    Import
                  </Button>
                  <Button
                    type="primary"
                    icon={<Plus size={16} strokeWidth={2.25} />}
                    onClick={() => setCreateOpen(true)}
                  >
                    New category
                  </Button>
                </>
              )}
            </div>
          ) : null
        }
      />

      <section aria-label="Category list">
        {!shopCode ? (
          <p className={styles.notice}>Select a shop in the header to load categories.</p>
        ) : loading ? (
          <ContentSkeleton variant="card-grid" gridItems={8} />
        ) : error ? (
          <p className={styles.notice}>Could not load categories: {String(error)}</p>
        ) : !categories ? (
          <p className={styles.notice}>Unexpected response from server.</p>
        ) : categories.length === 0 ? (
          <EmptyState
            message="No categories yet"
            description="Create your first category to start organizing your products into groups."
            icon={<FolderSearch size={48} />}
          />
        ) : visible.length === 0 ? (
          <p className={styles.notice}>No categories match &ldquo;{query.trim()}&rdquo;.</p>
        ) : (
          <ul className={styles.grid}>
            {visible.map((cat) => {
              const productCount = cat.products.length;
              const label = formatCategoryName(cat.name);
              const isEmpty = productCount === 0;
              return (
                <li key={cat.id}>
                  <Link
                    href={`/categories/${cat.id}`}
                    className={`${styles.card} ${isEmpty ? styles.cardEmpty : ""}`.trim()}
                    scroll={false}
                  >
                    <span className={styles.monogram} aria-hidden>
                      {label.charAt(0)}
                    </span>
                    <span className={styles.cardBody}>
                      <span className={styles.cardTitle}>{label}</span>
                      <span className={styles.cardMeta}>
                        {isEmpty ? (
                          "Empty"
                        ) : (
                          <>
                            {productCount} {productCount === 1 ? "product" : "products"}
                            <span aria-hidden> · </span>
                            {cat.totalStock.toLocaleString("en-IN")} units
                          </>
                        )}
                      </span>
                    </span>
                    <ChevronRight className={styles.chevron} aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Modal
        title="New category"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={onCreate}>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Enter a name" }]}
          >
            <Input placeholder="e.g. Mithai" autoComplete="off" autoFocus />
          </Form.Item>
          <div className={styles.modalFooter}>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Create category
            </Button>
          </div>
        </Form>
      </Modal>

      <CatalogImportModal
        kind="categories"
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => setListVersion((v) => v + 1)}
      />
    </div>
  );
}
