"use client";

import { useState, useEffect, useMemo } from "react";
import { Form, InputNumber, Button, App, Alert } from "antd";
import { Percent } from "lucide-react";
import { useShop } from "../../../../contexts/ShopContext";
import { apiFetch } from "../../../../lib/api";
import styles from "./TaxSettings.module.css";

function num(v: unknown): number {
    if (v === null || v === undefined || v === "") return 0;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
}

/** Use shop defaults only until the field exists in form state; `null` = cleared → 0. */
function rateValue(watched: unknown, shopFallback: unknown): number {
    if (watched !== undefined && watched !== null) return num(watched);
    return num(shopFallback);
}

export function TaxSettings() {
    const { message } = App.useApp();
    const { effectiveShopCode, shops } = useShop();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const currentShop = shops.find(s => s.shopCode === effectiveShopCode);

    const cgstW = Form.useWatch("cgstRate", form);
    const sgstW = Form.useWatch("sgstRate", form);

    const cgstVal = rateValue(cgstW, currentShop?.cgstRate);
    const sgstVal = rateValue(sgstW, currentShop?.sgstRate);

    const totalGst = useMemo(
        () => cgstVal + sgstVal,
        [cgstVal, sgstVal],
    );

    useEffect(() => {
        if (currentShop) {
            form.setFieldsValue({
                cgstRate: currentShop.cgstRate,
                sgstRate: currentShop.sgstRate,
            });
        }
    }, [currentShop, form]);

    const onFinish = async (values: { cgstRate: number; sgstRate: number }) => {
        if (!currentShop) return;
        setLoading(true);
        try {
            const res = await apiFetch(`/shops/${currentShop.id}`, {
                method: "PATCH",
                body: JSON.stringify(values),
            });
            if (!res.ok) throw new Error("Failed to update tax rates");
            
            message.success("Tax rates updated successfully. Please refresh or switch shops to apply changes everywhere.");
            // Note: ShopContext handles most things but a reload ensures everything is perfectly in sync
            setTimeout(() => {
              window.location.reload();
            }, 1000);
        } catch (e: unknown) {
            message.error(e instanceof Error ? e.message : "An error occurred");
        } finally {
            setLoading(false);
        }
    };

    if (!currentShop) {
      return (
        <p className={styles.emptyShop}>
          Select a shop in the header to manage tax settings.
        </p>
      );
    }

    const ratePrefix = (
      <span className={styles.inputIcon} aria-hidden>
        <Percent className="h-4 w-4" strokeWidth={1.75} />
      </span>
    );

    return (
        <div className={styles.root}>
            <Alert
              title="Inclusive tax billing"
              description="Prices in Billing POS are treated as including the GST rates below. Tax is not stacked on top of the listed selling price."
              type="info"
              showIcon
              className={styles.notice}
            />

            <Form form={form} layout="vertical" onFinish={onFinish} className={styles.form}>
                <div className={styles.grid}>
                    <Form.Item
                      label="CGST (%)"
                      name="cgstRate"
                      rules={[{ required: true, message: "Enter CGST rate" }]}
                      extra="Central Goods and Services Tax"
                    >
                        <InputNumber
                          prefix={ratePrefix}
                          placeholder="2.5"
                          min={0}
                          max={100}
                          step={0.1}
                          size="large"
                          className={`w-full !bg-[var(--surface)] ${styles.inputNumber}`}
                        />
                    </Form.Item>

                    <Form.Item
                      label="SGST (%)"
                      name="sgstRate"
                      rules={[{ required: true, message: "Enter SGST rate" }]}
                      extra="State Goods and Services Tax"
                    >
                        <InputNumber
                          prefix={ratePrefix}
                          placeholder="2.5"
                          min={0}
                          max={100}
                          step={0.1}
                          size="large"
                          className={`w-full !bg-[var(--surface)] ${styles.inputNumber}`}
                        />
                    </Form.Item>
                </div>

                <div className={styles.summary}>
                  <div className={styles.summaryMain}>
                    <div className={styles.summaryHero}>
                      <p className={styles.summaryLabel}>Combined GST rate</p>
                      <div className={styles.summaryValueRow}>
                        <span className={styles.summaryValue}>
                          {totalGst.toFixed(2)}
                        </span>
                        <span className={styles.summaryUnit}>%</span>
                      </div>
                    </div>
                    <div className={styles.breakdown} aria-label="Rate breakdown">
                      <span className={styles.breakdownChip}>
                        <span className={styles.breakdownKey}>CGST</span>
                        <span className={styles.breakdownVal}>
                          {cgstVal.toFixed(2)}%
                        </span>
                      </span>
                      <span className={styles.breakdownPlus} aria-hidden>
                        +
                      </span>
                      <span className={styles.breakdownChip}>
                        <span className={styles.breakdownKey}>SGST</span>
                        <span className={styles.breakdownVal}>
                          {sgstVal.toFixed(2)}%
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className={styles.summaryAction}>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={loading}
                      size="large"
                      className={styles.submit}
                    >
                      Save configuration
                    </Button>
                  </div>
                </div>
            </Form>
        </div>
    );
}
