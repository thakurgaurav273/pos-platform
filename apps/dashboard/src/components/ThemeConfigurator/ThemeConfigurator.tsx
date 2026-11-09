"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Alert, Button, ColorPicker, Segmented, Select, Slider } from "antd";
import { Check, ImagePlus, Trash2 } from "lucide-react";
import { contrast, isHexColour } from "@/lib/theme/color";
import { buildThemeVars } from "@/lib/theme/cssVars";
import { THEME_PRESETS, withPresetMatch } from "@/lib/theme/presets";
import { LOGO_HEIGHT, LOGO_WIDTH } from "@/lib/theme/types";
import type {
  FontStyle,
  HeaderStyle,
  RadiusStyle,
  ShopThemeConfig,
  SidebarStyle,
  ThemeMode,
} from "@/lib/theme/types";
import { uploadImageToCloudinary } from "@/lib/cloudinaryUpload";
import { ThemePreview } from "./ThemePreview";
import styles from "./ThemeConfigurator.module.css";

export type BrandingValue = { config: ShopThemeConfig; logoUrl: string | null };

type ThemeConfiguratorProps = {
  value: BrandingValue;
  onChange: (next: BrandingValue) => void;
  shopName?: string;
  /** Show the logo uploader (default true). */
  showLogo?: boolean;
  /** Stack the preview under the controls instead of beside them. */
  compact?: boolean;
  disabled?: boolean;
};

const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const COLOUR_FIELDS: {
  key: "primaryColor" | "secondaryColor" | "accentColor";
  label: string;
  hint: string;
}[] = [
  { key: "primaryColor", label: "Primary", hint: "Buttons, links, selected items" },
  { key: "secondaryColor", label: "Secondary", hint: "Charts and secondary highlights" },
  { key: "accentColor", label: "Accent", hint: "Badges and small highlights" },
];

const FONT_OPTIONS: { value: FontStyle; label: string }[] = [
  { value: "geist", label: "Geist (default)" },
  { value: "inter", label: "Inter" },
  { value: "system", label: "System font" },
  { value: "serif", label: "Serif headings" },
];

/** Brand-friendly swatches shown at the top of every colour picker. */
const SUGGESTED_COLOURS = [
  "#4f46e5", "#4338ca", "#2563eb", "#0284c7", "#0891b2", "#0d9488",
  "#047857", "#15803d", "#7c3aed", "#a21caf", "#be185d", "#8b2346",
  "#be123c", "#c2410c", "#1e3a8a", "#334155", "#3f3f46", "#18181b",
];

/**
 * One button that opens a colour picker: suggested swatches plus a free picker.
 * The hex value is shown for reference; typing it is optional (the panel has a
 * hex box for anyone who knows their brand code).
 */
function ColourField({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  const id = `colour-${label.toLowerCase()}`;
  const lowContrast = contrast(value, "#ffffff") < 3;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  // The panel lives in the page's scroll area, so it follows its button while scrolling.
  // Close it only once the button has scrolled out of view; closing on any scroll made it
  // shut immediately when a scroll was still easing out (trackpad momentum, smooth wheel).
  // IntersectionObserver accounts for clipping by the scroll container.
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!open || !trigger || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && !entry.isIntersecting) setOpen(false);
      },
      { threshold: 0 },
    );
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [open]);
  const presets = [
    {
      label: "Suggested",
      colors: SUGGESTED_COLOURS,
      defaultOpen: true,
      key: "suggested",
    },
  ];

  return (
    <div className={styles.colourRow}>
      <div className={styles.colourText}>
        <span id={`${id}-label`} className={styles.fieldLabel}>
          {label}
        </span>
        <span className={styles.fieldHint}>{hint}</span>
      </div>
      <ColorPicker
        value={value}
        disabledAlpha
        disabledFormat
        format="hex"
        disabled={disabled}
        presets={presets}
        // Side placement: antd can slide the ~420px panel vertically to keep it fully on
        // screen. Below/above the button it often fits neither way, and the browser then
        // scrolls the page to reveal the focused hex box.
        placement="left"
        open={open}
        onOpenChange={setOpen}
        onChangeComplete={(c) => {
          const hex = c.toHexString().slice(0, 7).toLowerCase();
          if (isHexColour(hex)) onChange(hex);
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          className={styles.colourTrigger}
          disabled={disabled}
          aria-labelledby={`${id}-label`}
          aria-describedby={lowContrast ? `${id}-msg` : undefined}
          aria-haspopup="dialog"
        >
          <span className={styles.colourSwatch} style={{ background: value }} aria-hidden />
          <span className={styles.colourTriggerText}>Choose colour</span>
          <span className={styles.colourHex}>{value}</span>
        </button>
      </ColorPicker>
      {lowContrast && (
        <p id={`${id}-msg`} className={styles.fieldWarn}>
          This colour is light; text in that colour will be darkened automatically to stay readable.
        </p>
      )}
    </div>
  );
}

/**
 * Reusable branding editor: presets, brand colours, appearance options, logo and a
 * live preview. Controlled; used by onboarding and Settings.
 */
export function ThemeConfigurator({
  value,
  onChange,
  shopName,
  showLogo = true,
  compact = false,
  disabled = false,
}: ThemeConfiguratorProps) {
  const { config, logoUrl } = value;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const setConfig = (patch: Partial<ShopThemeConfig>) =>
    onChange({ ...value, config: withPresetMatch({ ...config, ...patch }) });

  const presetIds = [...THEME_PRESETS.map((p) => p.id), "CUSTOM" as const];

  const selectPreset = (id: (typeof presetIds)[number]) => {
    if (id === "CUSTOM") {
      onChange({ ...value, config: { ...config, preset: "CUSTOM" } });
      return;
    }
    const preset = THEME_PRESETS.find((p) => p.id === id);
    if (preset) {
      const { mode, logoHeight, logoWidth } = config;
      onChange({ ...value, config: { ...preset.config, mode, logoHeight, logoWidth } });
    }
  };

  // Roving focus for the preset radio group (arrow keys move and select).
  const onPresetKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = presetIds.indexOf(config.preset);
    const last = presetIds.length - 1;
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? last
          : e.key === "ArrowRight" || e.key === "ArrowDown"
            ? (i + 1) % presetIds.length
            : (i - 1 + presetIds.length) % presetIds.length;
    selectPreset(presetIds[next]);
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons[next]?.focus();
  };

  const onLogoFile = async (file: File | undefined) => {
    if (!file) return;
    setLogoError(null);
    if (!LOGO_TYPES.includes(file.type)) {
      setLogoError("Use a PNG, JPG, SVG or WebP image.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError("The logo must be 2 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadImageToCloudinary(file);
      onChange({ ...value, logoUrl: url });
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className={`${styles.root} ${compact ? styles.compact : ""}`.trim()}>
      <div className={styles.controls}>
        <section className={styles.section} aria-labelledby="theme-presets-title">
          <h3 id="theme-presets-title" className={styles.sectionTitle}>
            Theme
          </h3>
          <div
            className={styles.presetGrid}
            role="radiogroup"
            aria-labelledby="theme-presets-title"
            onKeyDown={onPresetKeyDown}
          >
            {THEME_PRESETS.map((p) => {
              const selected = config.preset === p.id;
              const v = buildThemeVars(p.config, "light");
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  disabled={disabled}
                  className={`${styles.preset} ${selected ? styles.presetSelected : ""}`.trim()}
                  onClick={() => selectPreset(p.id)}
                  title={p.description}
                >
                  <span className={styles.presetSwatch} aria-hidden>
                    <span style={{ background: v["--sidebar-bg"].startsWith("var") ? "#ffffff" : v["--sidebar-bg"] }} />
                    <span style={{ background: p.config.primaryColor }} />
                    <span style={{ background: p.config.secondaryColor }} />
                    <span style={{ background: p.config.accentColor }} />
                  </span>
                  <span className={styles.presetName}>
                    {p.name}
                    {selected && <Check size={14} aria-hidden />}
                  </span>
                  <span className={styles.presetDesc}>{p.description}</span>
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={config.preset === "CUSTOM"}
              tabIndex={config.preset === "CUSTOM" ? 0 : -1}
              disabled={disabled}
              className={`${styles.preset} ${config.preset === "CUSTOM" ? styles.presetSelected : ""}`.trim()}
              onClick={() => selectPreset("CUSTOM")}
            >
              <span className={styles.presetSwatch} aria-hidden>
                <span style={{ background: config.primaryColor }} />
                <span style={{ background: config.secondaryColor }} />
                <span style={{ background: config.accentColor }} />
              </span>
              <span className={styles.presetName}>
                Custom
                {config.preset === "CUSTOM" && <Check size={14} aria-hidden />}
              </span>
              <span className={styles.presetDesc}>Your own colours and layout.</span>
            </button>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="theme-colours-title">
          <h3 id="theme-colours-title" className={styles.sectionTitle}>
            Brand colours
          </h3>
          <div className={styles.colourList}>
            {COLOUR_FIELDS.map((f) => (
              <ColourField
                key={f.key}
                label={f.label}
                hint={f.hint}
                value={config[f.key]}
                disabled={disabled}
                onChange={(hex) => setConfig({ [f.key]: hex })}
              />
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="theme-appearance-title">
          <h3 id="theme-appearance-title" className={styles.sectionTitle}>
            Appearance
          </h3>
          <div className={styles.optionGrid}>
            <div className={styles.option}>
              <span className={styles.fieldLabel} id="opt-mode">
                Colour mode
              </span>
              <Segmented<ThemeMode>
                aria-labelledby="opt-mode"
                disabled={disabled}
                value={config.mode}
                onChange={(mode) => setConfig({ mode })}
                options={[
                  { label: "Light", value: "light" },
                  { label: "Dark", value: "dark" },
                  { label: "System", value: "system" },
                ]}
              />
              <span className={styles.fieldHint}>
                Default for this shop. Each person can still switch on their own device.
              </span>
            </div>
            <div className={styles.option}>
              <span className={styles.fieldLabel} id="opt-sidebar">
                Sidebar
              </span>
              <Segmented<SidebarStyle>
                aria-labelledby="opt-sidebar"
                disabled={disabled}
                value={config.sidebarStyle}
                onChange={(sidebarStyle) => setConfig({ sidebarStyle })}
                options={[
                  { label: "Light", value: "light" },
                  { label: "Dark", value: "dark" },
                  { label: "Brand", value: "brand" },
                ]}
              />
            </div>
            <div className={styles.option}>
              <span className={styles.fieldLabel} id="opt-header">
                Header
              </span>
              <Segmented<HeaderStyle>
                aria-labelledby="opt-header"
                disabled={disabled}
                value={config.headerStyle}
                onChange={(headerStyle) => setConfig({ headerStyle })}
                options={[
                  { label: "Light", value: "light" },
                  { label: "Brand", value: "brand" },
                  { label: "Blend", value: "transparent" },
                ]}
              />
            </div>
            <div className={styles.option}>
              <span className={styles.fieldLabel} id="opt-radius">
                Corners
              </span>
              <Segmented<RadiusStyle>
                aria-labelledby="opt-radius"
                disabled={disabled}
                value={config.radius}
                onChange={(radius) => setConfig({ radius })}
                options={[
                  { label: "Sharp", value: "sharp" },
                  { label: "Default", value: "default" },
                  { label: "Rounded", value: "rounded" },
                ]}
              />
            </div>
            <div className={styles.option}>
              <label className={styles.fieldLabel} htmlFor="opt-font">
                Typography
              </label>
              <Select<FontStyle>
                id="opt-font"
                disabled={disabled}
                value={config.font}
                onChange={(font) => setConfig({ font })}
                options={FONT_OPTIONS}
                className={styles.fontSelect}
              />
            </div>
          </div>
        </section>

        {showLogo && (
          <section className={styles.section} aria-labelledby="theme-logo-title">
            <h3 id="theme-logo-title" className={styles.sectionTitle}>
              Shop logo
            </h3>
            <div className={styles.logoRow}>
              <div className={styles.logoBox}>
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt={`${shopName ?? "Shop"} logo`} />
                ) : (
                  <span className={styles.logoPlaceholder}>Fluxen POS logo</span>
                )}
              </div>
              <div className={styles.logoActions}>
                <input
                  ref={fileRef}
                  type="file"
                  accept={LOGO_TYPES.join(",")}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={(e) => onLogoFile(e.target.files?.[0])}
                />
                <Button
                  icon={<ImagePlus size={15} aria-hidden />}
                  loading={uploading}
                  disabled={disabled}
                  onClick={() => fileRef.current?.click()}
                >
                  {logoUrl ? "Replace logo" : "Upload logo"}
                </Button>
                {logoUrl && (
                  <Button
                    icon={<Trash2 size={15} aria-hidden />}
                    disabled={disabled || uploading}
                    onClick={() => onChange({ ...value, logoUrl: null })}
                  >
                    Use default logo
                  </Button>
                )}
                <span className={styles.fieldHint}>
                  PNG, JPG, SVG or WebP up to 2 MB. A wide logo on a transparent background works best.
                </span>
              </div>
            </div>
            {logoUrl && (
              <div className={`${styles.optionGrid} ${styles.logoSize}`}>
                {(
                  [
                    { key: "logoHeight", label: "Height", range: LOGO_HEIGHT },
                    { key: "logoWidth", label: "Max width", range: LOGO_WIDTH },
                  ] as const
                ).map(({ key, label, range }) => (
                  <div key={key} className={styles.option}>
                    <span className={styles.fieldLabel} id={`logo-${key}`}>
                      {label} · {config[key]}px
                    </span>
                    <Slider
                      aria-labelledby={`logo-${key}`}
                      className={styles.logoSlider}
                      disabled={disabled}
                      min={range.min}
                      max={range.max}
                      value={config[key]}
                      onChange={(px) => setConfig({ [key]: px })}
                      tooltip={{ formatter: (px) => `${px}px` }}
                    />
                  </div>
                ))}
                <span className={styles.fieldHint}>
                  The logo keeps its shape and fits inside this size in the sidebar.
                </span>
              </div>
            )}
            {logoError && (
              <Alert type="error" showIcon title={logoError} className={styles.logoError} />
            )}
          </section>
        )}
      </div>

      <div className={styles.previewCol}>
        <div className={styles.previewSticky}>
          <span className={styles.previewLabel}>Live preview</span>
          <ThemePreview config={config} logoUrl={logoUrl} shopName={shopName} />
        </div>
      </div>
    </div>
  );
}
