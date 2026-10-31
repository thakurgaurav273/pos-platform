/** Small colour helpers for the theme engine (no dependencies). Hex strings are `#rrggbb`. */

export type Rgb = { r: number; g: number; b: number };

export const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

export function isHexColour(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOUR.test(value);
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const h = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** `"168, 79, 28"` for use as `rgba(var(--x-rgb), 0.2)`. */
export function rgbTriplet(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

export function rgba(hex: string, alpha: number): string {
  return `rgba(${rgbTriplet(hex)}, ${alpha})`;
}

/** Linear blend: `t = 0` returns `a`, `t = 1` returns `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t,
  });
}

/** WCAG 2.1 relative luminance. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.1 contrast ratio (1 to 21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** White or near-black text, whichever reads better on `bg`. */
export function readableOn(bg: string): string {
  return contrast(bg, "#ffffff") >= contrast(bg, "#18181b") ? "#ffffff" : "#18181b";
}

/**
 * Moves `colour` toward `target` in small steps until it reaches `minRatio` contrast
 * against `against` (or hits the target). Used to keep brand colours legible.
 */
export function ensureContrast(
  colour: string,
  against: string,
  minRatio: number,
  target: string,
): string {
  let out = colour;
  for (let i = 1; i <= 20 && contrast(out, against) < minRatio; i++) {
    out = mix(colour, target, i * 0.05);
  }
  return out;
}
