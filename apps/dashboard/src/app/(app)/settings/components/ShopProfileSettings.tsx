"use client";

import { useEffect, useMemo, useState } from "react";
import {
  App,
  Alert,
  Button,
  Form,
  Input,
  Switch,
  Typography,
} from "antd";
import { useShop } from "@/contexts/ShopContext";
import { apiFetch } from "@/lib/api";
import styles from "./TaxSettings.module.css";
import { gstinOptionalRules, normalizeGstinFormValue, pincodeOptionalRules } from "@/lib/gstin";

type ShopProfileForm = {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  gstNumber?: string;
  fssaiNumber?: string;
  currency?: string;
  upiId?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  allowNextDayBooking: boolean;
  allowBookingWhenOutOfStock: boolean;
  allowShopSwitcher: boolean;
  isFactory: boolean;
};

export function ShopProfileSettings() {
  const { message } = App.useApp();
  const { effectiveShopCode, shops } = useShop();
  const [form] = Form.useForm<ShopProfileForm>();
  const [loading, setLoading] = useState(false);

  const currentShop = useMemo(
    () => shops.find((s) => s.shopCode === effectiveShopCode),
    [shops, effectiveShopCode],
  );

  useEffect(() => {
    if (!currentShop) return;
    form.setFieldsValue({
      name: currentShop.name,
      address: currentShop.address ?? undefined,
      city: currentShop.city ?? undefined,
      state: currentShop.state ?? undefined,
      country: currentShop.country ?? undefined,
      pincode: currentShop.pincode ?? undefined,
      phone: currentShop.phone ?? undefined,
      email: currentShop.email ?? undefined,
      gstNumber: currentShop.gstNumber ?? undefined,
      fssaiNumber: currentShop.fssaiNumber ?? undefined,
      currency: currentShop.currency ?? "INR",
      upiId: currentShop.upiId ?? undefined,
      bankName: currentShop.bankName ?? undefined,
      bankAccountNumber: currentShop.bankAccountNumber ?? undefined,
      bankIfsc: currentShop.bankIfsc ?? undefined,
      allowNextDayBooking: currentShop.allowNextDayBooking,
      allowBookingWhenOutOfStock: currentShop.allowBookingWhenOutOfStock,
      allowShopSwitcher: currentShop.allowShopSwitcher !== false,
      isFactory: currentShop.isFactory,
    });
  }, [currentShop, form]);

  const onFinish = async (values: ShopProfileForm) => {
    if (!currentShop) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/shops/${currentShop.id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err?.message === "string"
            ? err.message
            : "Failed to update shop",
        );
      }
      message.success("Shop details saved. Reloading…");
      setTimeout(() => window.location.reload(), 800);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "Could not save shop");
    } finally {
      setLoading(false);
    }
  };

  if (!currentShop) {
    return (
      <p className={styles.emptyShop}>
        Select a shop in the header to edit its profile.
      </p>
    );
  }

  return (
    <div className={styles.root}>
      <Alert
        title="Saved per shop and used on invoices, receipts and customer-facing pages. GST rates live under Tax configuration."
        type="info"
        showIcon
        className={styles.notice}
      />

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        className={styles.form}
      >
        <Typography.Title level={5} className="!mb-3 !mt-1">
          Identity &amp; location
        </Typography.Title>
        <div className={styles.grid}>
          <Form.Item
            label="Shop name"
            name="name"
            rules={[{ required: true, message: "Enter shop name" }]}
          >
            <Input placeholder="Shop name" />
          </Form.Item>
          <Form.Item label="Shop code (read-only)">
            <Input value={currentShop.shopCode} disabled />
          </Form.Item>
        </div>
        <Form.Item label="Address" name="address">
          <Input.TextArea rows={2} placeholder="Street, landmark…" />
        </Form.Item>
        <div className={styles.grid}>
          <Form.Item label="City" name="city">
            <Input placeholder="Raipur" />
          </Form.Item>
          <Form.Item label="State" name="state">
            <Input placeholder="Chhattisgarh" />
          </Form.Item>
        </div>
        <div className={styles.grid}>
          <Form.Item label="Country" name="country">
            <Input placeholder="India" />
          </Form.Item>
          <Form.Item label="PIN code" name="pincode" rules={pincodeOptionalRules}>
            <Input placeholder="492099" />
          </Form.Item>
        </div>

        <Typography.Title level={5} className="!mb-3 !mt-6">
          Contact
        </Typography.Title>
        <div className={styles.grid}>
          <Form.Item label="Phone" name="phone">
            <Input placeholder="+91…" />
          </Form.Item>
          <Form.Item label="Email" name="email">
            <Input type="email" placeholder="shop@example.com" />
          </Form.Item>
        </div>

        <Typography.Title level={5} className="!mb-3 !mt-6">
          Tax &amp; compliance
        </Typography.Title>
        <div className={styles.grid}>
          <Form.Item
            label="GSTIN"
            name="gstNumber"
            normalize={normalizeGstinFormValue}
            rules={gstinOptionalRules}
          >
            <Input placeholder="22AAAAA0000A1Z5" />
          </Form.Item>
          <Form.Item label="FSSAI no." name="fssaiNumber">
            <Input placeholder="License number" />
          </Form.Item>
        </div>
        <Form.Item
          label="Currency code"
          name="currency"
          extra="ISO code, e.g. INR"
        >
          <Input placeholder="INR" maxLength={8} />
        </Form.Item>

        <Typography.Title level={5} className="!mb-3 !mt-6">
          Payments &amp; banking
        </Typography.Title>
        <Form.Item label="UPI ID" name="upiId">
          <Input placeholder="shop@upi" />
        </Form.Item>
        <div className={styles.grid}>
          <Form.Item label="Bank name" name="bankName">
            <Input placeholder="Bank of Baroda" />
          </Form.Item>
          <Form.Item label="Account no." name="bankAccountNumber">
            <Input placeholder="Account number" />
          </Form.Item>
        </div>
        <Form.Item label="IFSC" name="bankIfsc">
          <Input placeholder="BARB0…" className="max-w-md" />
        </Form.Item>

        <Typography.Title level={5} className="!mb-3 !mt-6">
          Operations
        </Typography.Title>
        <div className="flex flex-col gap-4">
          <Form.Item
            label="Allow next-day booking"
            name="allowNextDayBooking"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            label="Allow booking when out of stock"
            name="allowBookingWhenOutOfStock"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            label="Allow shop switcher"
            name="allowShopSwitcher"
            valuePropName="checked"
            extra="When disabled, the shop selector in the header is locked and cannot be changed."
          >
            <Switch />
          </Form.Item>
          <Form.Item
            label="Factory / warehouse hub"
            name="isFactory"
            valuePropName="checked"
            extra="Factory shops can create new retail locations and seed stock. Change only if you understand the impact."
          >
            <Switch />
          </Form.Item>
        </div>

        {/* Long form: keep the save action in reach while scrolling */}
        <div className={styles.stickyFooter}>
          <span className={styles.stickyFooterNote}>
            Changes apply to <strong>{currentShop.shopCode}</strong> only.
          </span>
          <Button type="primary" htmlType="submit" loading={loading}>
            Save shop profile
          </Button>
        </div>
      </Form>
    </div>
  );
}
