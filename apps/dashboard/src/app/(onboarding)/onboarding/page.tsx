"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Checkbox, Form, Input, InputNumber } from "antd";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Factory, Palette, Plus, Store } from "lucide-react";
import { ThemeConfigurator, type BrandingValue } from "@/components/ThemeConfigurator/ThemeConfigurator";
import { useAuth } from "@/contexts/AuthContext";
import { useShop } from "@/contexts/ShopContext";
import { apiFetch } from "@/lib/api";
import { gstinOptionalRules, normalizeGstinFormValue, pincodeOptionalRules } from "@/lib/gstin";
import { indianMobileOptionalRules, normalizeMobileFormValue } from "@/lib/mobileNumber";
import { DEFAULT_THEME, resolveThemeConfig } from "@/lib/theme/presets";
import type { Shop } from "@/lib/types/shop";
import { FluxenLogo } from "@/components/FluxenLogo/FluxenLogo";
import styles from "./onboarding.module.css";

const STEPS = [
  { id: "factory", label: "Your factory", hint: "Central kitchen or warehouse", Icon: Factory },
  { id: "shops", label: "Your shops", hint: "Retail counters", Icon: Store },
  { id: "look", label: "Look and feel", hint: "Brand colours and logo", Icon: Palette },
  { id: "done", label: "All set", hint: "Review and launch", Icon: Check },
] as const;

type FactoryValues = {
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstNumber?: string;
  fssaiNumber?: string;
  upiId?: string;
  cgstRate: number;
  sgstRate: number;
};

type ShopValues = { name: string; city?: string; phone?: string };

/** Drops empty strings so optional API fields are left untouched instead of validated. */
function compact<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== ""),
  ) as Partial<T>;
}

async function errorText(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  const m = Array.isArray(data?.message) ? data.message[0] : data?.message;
  return typeof m === "string" ? m : fallback;
}

export default function OnboardingPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const { user } = useAuth();
  const { shops, shopsLoading, effectiveShopCode, refreshShops, updateShop } = useShop();

  const factory = useMemo(
    () => shops.find((s) => s.isFactory && s.shopCode === effectiveShopCode) ?? shops.find((s) => s.isFactory),
    [shops, effectiveShopCode],
  );
  const retailShops = useMemo(() => shops.filter((s) => !s.isFactory), [shops]);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const reduce = useReducedMotion();
  /** Steps slide 14px in the direction of travel; exit is quicker than entry. */
  const stepMotion = {
    initial: { opacity: 0, x: reduce ? 0 : dir * 14 },
    animate: { opacity: 1, x: 0, transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const } },
    exit: { opacity: 0, x: reduce ? 0 : dir * -10, transition: { duration: 0.14 } },
  };
  const [busy, setBusy] = useState(false);
  const [factoryForm] = Form.useForm<FactoryValues>();
  const [shopForm] = Form.useForm<ShopValues>();
  const [branding, setBranding] = useState<BrandingValue>({ config: DEFAULT_THEME, logoUrl: null });
  const [applyToAll, setApplyToAll] = useState(true);
  const [brandingReady, setBrandingReady] = useState(false);

  // Prefill from what the server already has, so a refresh mid-setup loses nothing.
  useEffect(() => {
    if (!factory) return;
    factoryForm.setFieldsValue({
      name: factory.name,
      phone: factory.phone ?? undefined,
      address: factory.address ?? undefined,
      city: factory.city ?? undefined,
      state: factory.state ?? undefined,
      pincode: factory.pincode ?? undefined,
      gstNumber: factory.gstNumber ?? undefined,
      fssaiNumber: factory.fssaiNumber ?? undefined,
      upiId: factory.upiId ?? undefined,
      cgstRate: factory.cgstRate,
      sgstRate: factory.sgstRate,
    });
    if (!brandingReady) {
      setBranding({ config: resolveThemeConfig(factory.themeConfig), logoUrl: factory.logoUrl ?? null });
      setBrandingReady(true);
    }
  }, [factory, factoryForm, brandingReady]);

  const next = () => {
    setDir(1);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => {
    setDir(-1);
    setStep((s) => Math.max(0, s - 1));
  };

  const saveFactory = async (values: FactoryValues) => {
    if (!factory) return;
    setBusy(true);
    try {
      const { cgstRate, sgstRate, ...rest } = values;
      const res = await apiFetch(`/shops/${factory.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...compact(rest),
          ...(rest.gstNumber ? { gstNumber: normalizeGstinFormValue(rest.gstNumber) } : {}),
          cgstRate,
          sgstRate,
        }),
      });
      if (!res.ok) throw new Error(await errorText(res, "Could not save your factory details."));
      updateShop((await res.json()) as Shop);
      next();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Could not save your factory details.");
    } finally {
      setBusy(false);
    }
  };

  const addShop = async (values: ShopValues) => {
    setBusy(true);
    try {
      const res = await apiFetch("/shops", { method: "POST", body: JSON.stringify(compact(values)) });
      if (!res.ok) throw new Error(await errorText(res, "Could not add this shop."));
      await refreshShops();
      shopForm.resetFields();
      message.success(`${values.name} added`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Could not add this shop.");
    } finally {
      setBusy(false);
    }
  };

  const saveBranding = async () => {
    setBusy(true);
    try {
      const targets = applyToAll ? shops : factory ? [factory] : [];
      const failed: string[] = [];
      for (const shop of targets) {
        const res = await apiFetch("/shops/current/branding", {
          method: "PATCH",
          headers: { "X-Shop": shop.shopCode },
          body: JSON.stringify({ themeConfig: branding.config, logoUrl: branding.logoUrl }),
        });
        if (res.ok) updateShop((await res.json()) as Shop);
        else failed.push(shop.name);
      }
      if (failed.length) {
        message.error(`Could not style: ${failed.join(", ")}. You can retry from Settings.`);
      }
      next();
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      const res = await apiFetch("/organizations/current/complete-onboarding", { method: "POST" });
      if (!res.ok) throw new Error(await errorText(res, "Could not finish setup."));
      router.replace("/dashboard");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Could not finish setup.");
      setBusy(false);
    }
  };

  const loadingShops = shopsLoading || !factory;

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <FluxenLogo size={34} />
        <Button type="text" onClick={finish} disabled={busy} className={styles.skip}>
          Skip setup, I&apos;ll do it later
        </Button>
      </header>

      <div className={`${styles.shell} ${step === 2 ? styles.shellWide : ""}`}>
        <nav aria-label="Setup progress" className={styles.rail}>
          <p className={styles.railHello}>Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</p>
          <p className={styles.railSub}>Four quick steps and you are ready to bill.</p>
          <ol className={styles.steps}>
            {STEPS.map((s, i) => {
              const state = i < step ? "done" : i === step ? "current" : "todo";
              return (
                <li key={s.id} className={styles.stepItem} data-state={state} aria-current={i === step ? "step" : undefined}>
                  <span className={styles.stepDot} aria-hidden>
                    {state === "done" ? <Check size={14} /> : String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span className={styles.stepLabel}>{s.label}</span>
                    <span className={styles.stepHint}>{s.hint}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className={styles.card}>
          <p className={styles.counter}>
            Step {step + 1} of {STEPS.length}
          </p>

          <AnimatePresence mode="wait" initial={false}>
          {step === 0 && (
            <motion.section key="factory" {...stepMotion} aria-labelledby="ob-h-factory">
              <h1 id="ob-h-factory" className={styles.title}>Set up your factory</h1>
              <p className={styles.lead}>
                The factory is your central kitchen or warehouse. Stock flows from here to every shop, and GST details
                print on your bills.
              </p>
              <Form form={factoryForm} layout="vertical" requiredMark={false} onFinish={saveFactory} disabled={loadingShops || busy} initialValues={{ cgstRate: 2.5, sgstRate: 2.5 }}>
                <div className={styles.grid}>
                  <Form.Item name="name" label="Factory name" rules={[{ required: true, message: "Enter a name." }]} className={styles.span2}>
                    <Input autoComplete="organization" />
                  </Form.Item>
                  <Form.Item name="phone" label="Phone" normalize={normalizeMobileFormValue} rules={indianMobileOptionalRules}>
                    <Input inputMode="numeric" maxLength={10} placeholder="10-digit mobile" />
                  </Form.Item>
                  <Form.Item name="upiId" label="UPI ID" extra="Shown as a QR on bills.">
                    <Input placeholder="name@bank" autoCapitalize="off" />
                  </Form.Item>
                  <Form.Item name="address" label="Address" className={styles.span2}>
                    <Input autoComplete="street-address" />
                  </Form.Item>
                  <Form.Item name="city" label="City">
                    <Input autoComplete="address-level2" />
                  </Form.Item>
                  <Form.Item name="state" label="State">
                    <Input autoComplete="address-level1" />
                  </Form.Item>
                  <Form.Item name="pincode" label="PIN code" rules={pincodeOptionalRules}>
                    <Input inputMode="numeric" maxLength={6} />
                  </Form.Item>
                  <Form.Item name="gstNumber" label="GSTIN" normalize={normalizeGstinFormValue} rules={gstinOptionalRules}>
                    <Input placeholder="22AAAAA0000A1Z5" />
                  </Form.Item>
                  <Form.Item name="fssaiNumber" label="FSSAI licence no.">
                    <Input inputMode="numeric" />
                  </Form.Item>
                  <div className={styles.rates}>
                    <Form.Item name="cgstRate" label="CGST %" rules={[{ required: true, message: "Required" }]}>
                      <InputNumber min={0} max={20} step={0.5} className={styles.fullWidth} />
                    </Form.Item>
                    <Form.Item name="sgstRate" label="SGST %" rules={[{ required: true, message: "Required" }]}>
                      <InputNumber min={0} max={20} step={0.5} className={styles.fullWidth} />
                    </Form.Item>
                  </div>
                </div>
                <div className={styles.actions}>
                  <span />
                  <Button type="primary" htmlType="submit" loading={busy} disabled={loadingShops}>
                    Save and continue <ArrowRight size={16} aria-hidden />
                  </Button>
                </div>
              </Form>
            </motion.section>
          )}

          {step === 1 && (
            <motion.section key="shops" {...stepMotion} aria-labelledby="ob-h-shops">
              <h1 id="ob-h-shops" className={styles.title}>Add your shops</h1>
              <p className={styles.lead}>
                Each retail counter gets its own stock, staff and sales. You can add more any time from the Shops page.
              </p>

              {retailShops.length > 0 && (
                <ul className={styles.shopList} aria-label="Shops added">
                  {retailShops.map((s) => (
                    <li key={s.id} className={styles.shopRow}>
                      <Store size={18} aria-hidden />
                      <span className={styles.shopName}>{s.name}</span>
                      <span className={styles.shopMeta}>{[s.city, s.shopCode].filter(Boolean).join(" · ")}</span>
                      <Check size={16} className={styles.ok} aria-label="Added" />
                    </li>
                  ))}
                </ul>
              )}

              <Form form={shopForm} layout="vertical" requiredMark={false} onFinish={addShop} disabled={busy}>
                <div className={styles.grid}>
                  <Form.Item name="name" label="Shop name" rules={[{ required: true, message: "Enter a shop name." }]} className={styles.span2}>
                    <Input placeholder="e.g. Park Street Counter" />
                  </Form.Item>
                  <Form.Item name="city" label="City">
                    <Input />
                  </Form.Item>
                  <Form.Item name="phone" label="Phone" normalize={normalizeMobileFormValue} rules={indianMobileOptionalRules}>
                    <Input inputMode="numeric" maxLength={10} />
                  </Form.Item>
                </div>
                <Button htmlType="submit" loading={busy} icon={<Plus size={16} aria-hidden />}>
                  Add shop
                </Button>
              </Form>

              <div className={styles.actions}>
                <Button type="text" onClick={back} disabled={busy} icon={<ArrowLeft size={16} aria-hidden />}>
                  Back
                </Button>
                <Button type="primary" onClick={next} disabled={busy}>
                  {retailShops.length ? "Continue" : "Skip for now"} <ArrowRight size={16} aria-hidden />
                </Button>
              </div>
            </motion.section>
          )}

          {step === 2 && (
            <motion.section key="look" {...stepMotion} aria-labelledby="ob-h-look">
              <h1 id="ob-h-look" className={styles.title}>Make it yours</h1>
              <p className={styles.lead}>Pick a starting style, tune the colours and add your logo. The preview updates as you go.</p>
              <ThemeConfigurator value={branding} onChange={setBranding} shopName={factory?.name} disabled={busy} />
              {shops.length > 1 && (
                <Checkbox checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} className={styles.applyAll}>
                  Use this look for all {shops.length} locations
                </Checkbox>
              )}
              <div className={styles.actions}>
                <Button type="text" onClick={back} disabled={busy} icon={<ArrowLeft size={16} aria-hidden />}>
                  Back
                </Button>
                <Button type="primary" onClick={saveBranding} loading={busy}>
                  Save and continue <ArrowRight size={16} aria-hidden />
                </Button>
              </div>
            </motion.section>
          )}

          {step === 3 && (
            <motion.section key="done" {...stepMotion} aria-labelledby="ob-h-done">
              <h1 id="ob-h-done" className={styles.title}>You are all set</h1>
              <p className={styles.lead}>Here is what we created. Everything can be changed later in Settings.</p>
              <dl className={styles.summary}>
                <div>
                  <dt>Factory</dt>
                  <dd>{factory?.name}</dd>
                </div>
                <div>
                  <dt>Retail shops</dt>
                  <dd>{retailShops.length ? retailShops.map((s) => s.name).join(", ") : "None yet"}</dd>
                </div>
                <div>
                  <dt>Style</dt>
                  <dd>{branding.config.preset.charAt(0) + branding.config.preset.slice(1).toLowerCase()}</dd>
                </div>
              </dl>
              <p className={styles.nextUp}>
                Next: add your products in Inventory, invite staff from Users, then open Billing to ring up your first sale.
              </p>
              <div className={styles.actions}>
                <Button type="text" onClick={back} disabled={busy} icon={<ArrowLeft size={16} aria-hidden />}>
                  Back
                </Button>
                <Button type="primary" onClick={finish} loading={busy}>
                  Open my dashboard <ArrowRight size={16} aria-hidden />
                </Button>
              </div>
            </motion.section>
          )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
