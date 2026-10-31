"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Upload,
} from "antd";
import { ContentSkeleton } from "@/components/ContentSkeleton/ContentSkeleton";
import { BarcodePrintModal } from "@/components/BarcodePrintModal/BarcodePrintModal";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { isAtLeastManager } from "@/lib/rolePermissions";
import { uploadImageToCloudinary } from "@/lib/cloudinaryUpload";
import styles from "./page.module.css";
import {
  ArrowLeft,
  Globe,
  Link as LinkIcon,
  Plus,
  Printer,
  Trash2,
  Upload as UploadIcon,
} from "lucide-react";
import {
  costPriceInputProps,
  priceInputProps,
  sellingPriceRules,
  UNIT_OPTIONS,
} from "@/lib/catalogFields";


type VariantDetail = {
  id: string;
  name: string;
  barcode: string;
  sku: string | null;
  quantity: number;
  minStock: number | null;
  price: number;
  costPrice: number | null;
  unit: string | null;
  hsnCode: string | null;
  product: {
    id: string;
    name: string;
    description: string | null;
    isListedOnWebsite: boolean;
    shopCode: string;
    isActive: boolean;
    category: { id: string; name: string } | null;
    shop: { name: string; shopCode: string };
    images: { id: string; url: string }[];
  };
};

type VariantFormValues = {
  productName: string;
  description: string;
  categoryId?: string;
  shopName: string;
  shopCode: string;
  variantName: string;
  barcode: string;
  sku: string;
  hsnCode: string;
  quantity: number;
  minStock?: number;
  unit: string;
  price: number;
  costPrice?: number;
  isListedOnWebsite: boolean;
  imageUrls: string[];
  pendingImageUrl: string;
};

function ImageUrlsFormAnchor({
  value: _v,
  onChange: _on,
}: {
  value?: string[];
  onChange?: (v: string[]) => void;
}) {
  return (
    <span
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        overflow: "hidden",
        clip: "rect(0,0,0,0)",
      }}
      aria-hidden
    />
  );
}

type InventoryVariantEditorProps = {
  detail: VariantDetail;
  variantId: string;
  onSaved: (d: VariantDetail) => void;
  onOpenPrint: () => void;
};

function InventoryVariantEditor({
  detail,
  variantId,
  onSaved,
  onOpenPrint,
}: InventoryVariantEditorProps) {
  const { message } = App.useApp();
  const { user } = useAuth();
  // The API only lets a manager or above change prices and stock (other fields stay editable).
  const canEditPricing = isAtLeastManager(user?.role);
  const managerOnlyNote = canEditPricing ? undefined : "Only a manager can change this.";
  const router = useRouter();
  const searchParams = useSearchParams();
  // Back returns to the list the user came from: Products when it says so, else Stock.
  const back =
    searchParams.get("from") === "products"
      ? { href: "/products", label: "Products" }
      : { href: "/products?tab=stock", label: "Stock" };
  const [form] = Form.useForm<VariantFormValues>();
  const [saving, setSaving] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<
    { label: string; value: string }[]
  >([]);

  const imageUrls = Form.useWatch("imageUrls", form) ?? [];

  useEffect(() => {
    void apiFetch("/category")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setCategoryOptions(
            data.map((c: { id: string; name: string }) => ({
              label: c.name,
              value: c.id,
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const urls = (detail.product.images || []).map((img) => img.url);
    form.setFieldsValue({
      productName: detail.product.name,
      description: detail.product.description ?? "",
      categoryId: detail.product.category?.id,
      shopName: detail.product.shop.name,
      shopCode: detail.product.shopCode,
      variantName: detail.name,
      barcode: detail.barcode,
      sku: detail.sku ?? "",
      hsnCode: detail.hsnCode ?? "",
      quantity: detail.quantity,
      minStock: detail.minStock ?? undefined,
      unit: detail.unit ?? "PC",
      price: detail.price,
      costPrice: detail.costPrice ?? undefined,
      isListedOnWebsite: detail.product.isListedOnWebsite,
      imageUrls: urls,
      pendingImageUrl: "",
    });
  }, [detail, form]);

  const addImageByUrl = () => {
    const pending = (form.getFieldValue("pendingImageUrl") ?? "").trim();
    if (!pending) return;
    const current = (form.getFieldValue("imageUrls") ?? []) as string[];
    if (current.includes(pending)) {
      message.warning("This image is already added");
      return;
    }
    form.setFieldsValue({
      imageUrls: [...current, pending],
      pendingImageUrl: "",
    });
  };

  const removeImage = (url: string) => {
    const current = (form.getFieldValue("imageUrls") ?? []) as string[];
    form.setFieldValue(
      "imageUrls",
      current.filter((u) => u !== url),
    );
  };

  const handleUpload = async (file: File) => {
    try {
      const url = await uploadImageToCloudinary(file);
      const current = (form.getFieldValue("imageUrls") ?? []) as string[];
      form.setFieldValue("imageUrls", [...current, url]);
      message.success("Image uploaded");
      return false;
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Upload failed");
      return false;
    }
  };

  const onFinish = async (values: VariantFormValues) => {
    setSaving(true);
    try {
      const res = await apiFetch(`/inventory/variants/${variantId}`, {
        method: "PATCH",
        body: JSON.stringify({
          // Stock is only sent when edited, with the value it was loaded at, so the API
          // can reject the save (409) if a sale changed it in the meantime.
          ...(values.quantity !== detail.quantity
            ? { quantity: values.quantity, expectedQuantity: detail.quantity }
            : {}),
          minStock: values.minStock ?? null,
          price: values.price,
          costPrice: values.costPrice ?? null,
          sku: values.sku === "" ? null : values.sku,
          unit: values.unit,
          hsnCode: values.hsnCode === "" ? null : values.hsnCode,
          description: values.description,
          isListedOnWebsite: values.isListedOnWebsite,
          images: values.imageUrls ?? [],
          name: values.variantName.trim(),
          productName: values.productName.trim(),
          categoryId:
            values.categoryId === undefined || values.categoryId === ""
              ? null
              : values.categoryId,
          barcode: values.barcode.trim(),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg =
          typeof errBody?.message === "string"
            ? errBody.message
            : Array.isArray(errBody?.message)
              ? errBody.message.join(", ")
              : res.statusText;
        throw new Error(msg);
      }
      const updated = (await res.json()) as VariantDetail;
      onSaved(updated);
      message.success("Saved");
    } catch (e) {
      message.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const productLabel = detail.product.name;

  // Live readouts while editing
  const watchedPrice = Form.useWatch("price", form);
  const watchedCost = Form.useWatch("costPrice", form);
  const watchedQty = Form.useWatch("quantity", form);
  const watchedMin = Form.useWatch("minStock", form);
  const watchedUnit = Form.useWatch("unit", form);
  const inr = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
  const margin =
    typeof watchedPrice === "number" && typeof watchedCost === "number" && watchedCost > 0
      ? { amount: watchedPrice - watchedCost, pct: watchedPrice > 0 ? ((watchedPrice - watchedCost) / watchedPrice) * 100 : 0 }
      : null;
  const qty = typeof watchedQty === "number" ? watchedQty : detail.quantity;
  const stockState =
    qty <= 0 ? "out" : typeof watchedMin === "number" && qty <= watchedMin ? "low" : "ok";

  return (
    <Form<VariantFormValues>
      form={form}
      layout="vertical"
      className={styles.form}
      onFinish={onFinish}
      requiredMark={false}
    >
      <Form.Item name="imageUrls" noStyle initialValue={[]}>
        <ImageUrlsFormAnchor />
      </Form.Item>

      <header className={styles.header}>
        <div className={styles.headerText}>
          <Link href={back.href} className={styles.backLink} scroll={false}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {back.label}
          </Link>
          <h1 className={styles.title}>{productLabel}</h1>
          <p className={styles.subtitle}>
            <span>{detail.name}</span>
            {detail.product.category?.name ? (
              <span>{detail.product.category.name.replace(/_/g, " ")}</span>
            ) : null}
            {detail.barcode ? <span className={styles.mono}>{detail.barcode}</span> : null}
          </p>
        </div>
        <div className={styles.headerActions}>
          {detail.barcode ? (
            <Button icon={<Printer className="h-4 w-4" aria-hidden />} onClick={onOpenPrint}>
              Print label
            </Button>
          ) : null}
          <Button type="primary" htmlType="submit" loading={saving}>
            Save changes
          </Button>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.mainCol}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Product</h2>
            <p className={styles.sectionHint}>Shared by every variant of this product.</p>
            <div className={styles.grid}>
              <Form.Item
                name="productName"
                label="Product name"
                rules={[{ required: true, message: "Required" }]}
              >
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name="categoryId" label="Category">
                <Select
                  placeholder="Uncategorized"
                  options={categoryOptions}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  className={styles.fullWidth}
                />
              </Form.Item>
              <Form.Item
                name="description"
                label="Description"
                className={styles.span2}
                extra="Shown to customers on the website menu."
              >
                <Input.TextArea rows={3} placeholder="A short, appetising description" />
              </Form.Item>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Variant</h2>
            <p className={styles.sectionHint}>Pack size and the codes used at the counter and on invoices.</p>
            <div className={styles.grid}>
              <Form.Item
                name="variantName"
                label="Variant name"
                rules={[{ required: true, message: "Required" }]}
              >
                <Input placeholder="e.g. Regular, 500g" autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="barcode"
                label="Barcode"
                rules={[{ required: true, message: "Required" }]}
              >
                <Input autoComplete="off" className={styles.mono} />
              </Form.Item>
              <Form.Item name="sku" label="SKU">
                <Input placeholder="Optional" />
              </Form.Item>
              <Form.Item name="hsnCode" label="HSN code">
                <Input placeholder="Optional" />
              </Form.Item>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Pricing</h2>
            <div className={styles.grid}>
              <Form.Item
                name="price"
                label="Selling price"
                rules={sellingPriceRules}
                extra={managerOnlyNote}
              >
                <InputNumber
                  className={styles.fullWidth}
                  {...priceInputProps}
                  prefix={"\u20B9"}
                  disabled={!canEditPricing}
                />
              </Form.Item>
              <Form.Item name="costPrice" label="Cost price">
                <InputNumber
                  className={styles.fullWidth}
                  {...costPriceInputProps}
                  prefix={"\u20B9"}
                  disabled={!canEditPricing}
                />
              </Form.Item>
            </div>
            <p className={styles.readout}>
              {margin ? (
                <>
                  Margin{" "}
                  <strong className={margin.amount < 0 ? styles.readoutBad : undefined}>
                    {inr(margin.amount)} ({margin.pct.toFixed(1)}%)
                  </strong>{" "}
                  per {watchedUnit ?? "unit"}
                </>
              ) : (
                "Add a cost price to see your margin."
              )}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Stock</h2>
            <div className={styles.grid3}>
              <Form.Item
                name="quantity"
                label="Quantity on hand"
                rules={[{ required: true, type: "number", min: 0 }]}
                extra={managerOnlyNote}
              >
                <InputNumber className={styles.fullWidth} min={0} disabled={!canEditPricing} />
              </Form.Item>
              <Form.Item name="minStock" label="Low-stock alert at">
                <InputNumber
                  className={styles.fullWidth}
                  min={0}
                  placeholder="Off"
                  disabled={!canEditPricing}
                />
              </Form.Item>
              <Form.Item
                name="unit"
                label="Unit"
                rules={[{ required: true, message: "Select unit" }]}
              >
                <Select options={UNIT_OPTIONS} className={styles.fullWidth} />
              </Form.Item>
            </div>
            <p className={styles.readout}>
              <span className={`${styles.stockDot} ${styles[`stock_${stockState}`]}`} aria-hidden />
              {stockState === "out"
                ? "Out of stock"
                : stockState === "low"
                  ? "Low stock: at or below the alert level"
                  : "In stock"}
            </p>
          </section>
        </div>

        <aside className={styles.sideCol}>
          <section className={styles.section}>
            <div className={styles.toggleRow}>
              <div>
                <h2 className={styles.sectionTitle}>
                  <Globe className="h-4 w-4 text-[var(--bistre-400)]" aria-hidden /> On website
                </h2>
                <p className={styles.sectionHint}>Show this product on the online menu.</p>
              </div>
              <Form.Item name="isListedOnWebsite" valuePropName="checked" noStyle>
                <Switch aria-label="Public on website" />
              </Form.Item>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Images</h2>
            <p className={styles.sectionHint}>The first image is used on the menu and at the counter.</p>
            <div className={styles.imageGallery}>
              {imageUrls.map((url, index) => (
                <div key={`${url}-${index}`} className={styles.imageContainer}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary remote image URLs */}
                  <img src={url} alt={`Product image ${index + 1}`} className={styles.previewImage} />
                  {index === 0 ? <span className={styles.coverBadge}>Cover</span> : null}
                  <button
                    type="button"
                    className={styles.deleteImageBtn}
                    onClick={() => removeImage(url)}
                    aria-label={`Remove image ${index + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ))}
              <Upload accept="image/*" showUploadList={false} multiple={false} beforeUpload={handleUpload}>
                <button type="button" className={styles.uploadBox}>
                  <UploadIcon className="h-5 w-5" aria-hidden />
                  <span>Upload</span>
                </button>
              </Upload>
            </div>
            <Form.Item name="pendingImageUrl" noStyle>
              <Input
                className={styles.urlInput}
                placeholder="Or paste an image link"
                onPressEnter={(e) => {
                  e.preventDefault();
                  addImageByUrl();
                }}
                prefix={<LinkIcon className="h-4 w-4 text-[var(--bistre-400)]" aria-hidden />}
                suffix={
                  <Button
                    type="text"
                    size="small"
                    onClick={addImageByUrl}
                    aria-label="Add image link"
                    icon={<Plus className="h-4 w-4" aria-hidden />}
                  />
                }
              />
            </Form.Item>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Shop</h2>
            <div className={styles.readonlyGrid}>
              <Form.Item name="shopName" label="Name">
                <Input disabled />
              </Form.Item>
              <Form.Item name="shopCode" label="Code">
                <Input disabled />
              </Form.Item>
            </div>
          </section>
        </aside>
      </div>

      {/* Save stays in reach on long screens */}
      <div className={styles.saveBar}>
        <Button onClick={() => router.push(back.href)}>Back</Button>
        <Button type="primary" htmlType="submit" loading={saving}>
          Save changes
        </Button>
      </div>
    </Form>
  );
}

export default function InventoryVariantDetailPage() {
  const { message } = App.useApp();
  const params = useParams();
  const router = useRouter();
  const variantId = params.variantId as string;
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<VariantDetail | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/inventory/variants/${variantId}`, {
        method: "GET",
      });
      if (!res.ok) {
        if (res.status === 404) {
          message.error("Variant not found");
          router.push("/products?tab=stock");
          return;
        }
        throw new Error(res.statusText);
      }
      const data = (await res.json()) as VariantDetail;
      setDetail(data);
    } catch (e) {
      message.error(String(e));
    } finally {
      setLoading(false);
    }
  }, [variantId, router, message]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={styles.page}>
      {loading && !detail ? (
        <ContentSkeleton variant="detail" rowCount={10} />
      ) : (
        <>
          {detail ? (
            <InventoryVariantEditor
              key={detail.id}
              detail={detail}
              variantId={variantId}
              onSaved={setDetail}
              onOpenPrint={() => setPrintModalOpen(true)}
            />
          ) : null}

          {detail ? (
            <BarcodePrintModal
              open={printModalOpen}
              onCancel={() => setPrintModalOpen(false)}
              items={[
                {
                  id: detail.id,
                  productName: detail.product.name,
                  variantName: detail.name,
                  barcode: detail.barcode,
                  price: detail.price,
                },
              ]}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
