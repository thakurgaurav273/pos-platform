"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Popconfirm } from "antd";
import { RotateCcw } from "lucide-react";
import {
  ThemeConfigurator,
  type BrandingValue,
} from "@/components/ThemeConfigurator/ThemeConfigurator";
import { useShop } from "@/contexts/ShopContext";
import { useTheme } from "@/contexts/ThemeContext";
import { apiFetch } from "@/lib/api";
import { DEFAULT_THEME, themeConfigEquals } from "@/lib/theme/presets";
import type { Shop } from "@/lib/types/shop";
import styles from "./AppearanceSettings.module.css";

function sameBranding(a: BrandingValue, b: BrandingValue): boolean {
  return a.logoUrl === b.logoUrl && themeConfigEquals(a.config, b.config);
}

/**
 * Settings > Shop > Appearance & branding. Edits are previewed across the whole app
 * immediately and only persisted on Save; leaving the section discards the preview.
 */
export function AppearanceSettings() {
  const { message } = App.useApp();
  const { activeShop, updateShop } = useShop();
  const { savedConfig, savedLogoUrl, setPreview } = useTheme();

  const saved = useMemo<BrandingValue>(
    () => ({ config: savedConfig, logoUrl: savedLogoUrl }),
    [savedConfig, savedLogoUrl],
  );
  const [draft, setDraft] = useState<BrandingValue>(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync the draft when the saved theme changes underneath (shop loaded or saved).
  const [syncedFrom, setSyncedFrom] = useState(saved);
  if (syncedFrom !== saved) {
    setSyncedFrom(saved);
    setDraft(saved);
  }

  const dirty = !sameBranding(draft, saved);

  // Live preview across the app while there are unsaved changes.
  useEffect(() => {
    setPreview(dirty ? draft : null);
  }, [dirty, draft, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);

  if (!activeShop) {
    return <p className={styles.empty}>Select a shop in the header to edit its appearance.</p>;
  }

  const isDefaultTheme = themeConfigEquals(draft.config, DEFAULT_THEME);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/shops/current/branding", {
        method: "PATCH",
        body: JSON.stringify({
          // The default theme is stored as NULL so the shop follows future default tweaks.
          themeConfig: isDefaultTheme ? null : draft.config,
          logoUrl: draft.logoUrl,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Shop & { message?: unknown };
      if (!res.ok) {
        const msg = Array.isArray(body.message)
          ? body.message.join(", ")
          : typeof body.message === "string"
            ? body.message
            : "Could not save appearance";
        throw new Error(msg);
      }
      updateShop(body);
      message.success("Appearance saved for everyone in this shop");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save appearance";
      setError(msg);
      message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.root}>
      <Alert
        type="info"
        showIcon
        title={
          <>
            Changes preview across the app straight away and are saved only for{" "}
            <strong>{activeShop.name}</strong>. Other shops keep their own look.
          </>
        }
      />

      <ThemeConfigurator
        value={draft}
        onChange={setDraft}
        shopName={activeShop.name}
        disabled={saving}
      />

      {error && <Alert type="error" showIcon title={error} />}

      <div className={styles.footer}>
        <Popconfirm
          title="Restore the default theme?"
          description="Brand colours and layout go back to the Fluxen default. Your logo is kept."
          okText="Restore"
          onConfirm={() => setDraft((d) => ({ ...d, config: { ...DEFAULT_THEME } }))}
          disabled={isDefaultTheme}
        >
          <Button icon={<RotateCcw size={15} aria-hidden />} disabled={isDefaultTheme || saving}>
            Restore default theme
          </Button>
        </Popconfirm>
        <div className={styles.footerRight}>
          <span className={styles.status} aria-live="polite">
            {dirty ? "Unsaved changes (previewing)" : "All changes saved"}
          </span>
          <Button disabled={!dirty || saving} onClick={() => setDraft(saved)}>
            Discard
          </Button>
          <Button type="primary" loading={saving} disabled={!dirty} onClick={save}>
            Save appearance
          </Button>
        </div>
      </div>
    </div>
  );
}
