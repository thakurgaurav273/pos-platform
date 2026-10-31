-- Per-shop portal appearance (theme preset, brand colours, mode, layout style).
-- Nullable and additive: existing shops keep NULL and render with the default theme.
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "themeConfig" JSONB;
