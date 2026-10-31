import { BadRequestException } from '@nestjs/common';

/**
 * Shape of `Shop.themeConfig`. Mirrored by the dashboard in
 * `apps/dashboard/src/lib/theme/types.ts`; keep the two lists in sync.
 */
export const THEME_PRESETS = [
  'CLASSIC',
  'MODERN',
  'MINIMAL',
  'ELEGANT',
  'PREMIUM',
  'CUSTOM',
] as const;
export const THEME_MODES = ['light', 'dark', 'system'] as const;
export const SIDEBAR_STYLES = ['light', 'dark', 'brand'] as const;
export const HEADER_STYLES = ['light', 'brand', 'transparent'] as const;
export const RADIUS_STYLES = ['sharp', 'default', 'rounded'] as const;
export const FONT_STYLES = ['geist', 'inter', 'system', 'serif'] as const;

export type ThemePreset = (typeof THEME_PRESETS)[number];

export type ShopThemeConfig = {
  version: 1;
  preset: ThemePreset;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  mode: (typeof THEME_MODES)[number];
  sidebarStyle: (typeof SIDEBAR_STYLES)[number];
  headerStyle: (typeof HEADER_STYLES)[number];
  radius: (typeof RADIUS_STYLES)[number];
  font: (typeof FONT_STYLES)[number];
};

export const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

/** Logo URLs must be absolute https links (Cloudinary uploads) and reasonably short. */
export const LOGO_URL_MAX_LENGTH = 1000;

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function pick<T extends readonly string[]>(
  list: T,
  value: unknown,
  field: string,
): T[number] {
  if (
    typeof value === 'string' &&
    (list as readonly string[]).includes(value)
  ) {
    return value as T[number];
  }
  throw new BadRequestException(
    `themeConfig.${field} must be one of: ${list.join(', ')}`,
  );
}

function colour(value: unknown, field: string): string {
  if (typeof value === 'string' && HEX_COLOUR.test(value)) {
    return value.toLowerCase();
  }
  throw new BadRequestException(
    `themeConfig.${field} must be a 6-digit hex colour like #a84f1c`,
  );
}

/**
 * Validates an incoming theme payload and returns a clean copy with only known keys
 * and lowercase colours. Used after DTO validation so stored JSON is always canonical.
 */
export function normalizeThemeConfig(input: unknown): ShopThemeConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('themeConfig must be an object');
  }
  const o = input as Record<string, unknown>;
  return {
    version: 1,
    preset: pick(THEME_PRESETS, o.preset, 'preset'),
    primaryColor: colour(o.primaryColor, 'primaryColor'),
    secondaryColor: colour(o.secondaryColor, 'secondaryColor'),
    accentColor: colour(o.accentColor, 'accentColor'),
    mode: pick(THEME_MODES, o.mode, 'mode'),
    sidebarStyle: pick(SIDEBAR_STYLES, o.sidebarStyle, 'sidebarStyle'),
    headerStyle: pick(HEADER_STYLES, o.headerStyle, 'headerStyle'),
    radius: pick(RADIUS_STYLES, o.radius, 'radius'),
    font: pick(FONT_STYLES, o.font, 'font'),
  };
}

/** `undefined` = leave unchanged, `null` = clear, string = validated https URL. */
export function normalizeLogoUrl(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > LOGO_URL_MAX_LENGTH || !isHttpsUrl(trimmed)) {
    throw new BadRequestException('logoUrl must be an https URL');
  }
  return trimmed;
}
