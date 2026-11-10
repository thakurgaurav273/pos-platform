/**
 * Single source for the details quoted on the legal pages. Override per deployment with
 * NEXT_PUBLIC_* variables (build-time). Check every value before relying on these pages.
 */
export const LEGAL = {
  productName: "Fluxen POS",
  /** Legal name of the business operating the service. */
  operator: process.env.NEXT_PUBLIC_LEGAL_ENTITY?.trim() || "Fluxen POS",
  supportEmail:
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@rentrik.in",
  /** Postal address; the contact page shows it only when set. */
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS?.trim() || "",
  siteUrl: (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://fluxen.rentrik.in"
  ).replace(/\/+$/, ""),
  /** Bump when a policy changes in substance. */
  effectiveDate: "10 November 2026",
} as const;

export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/refunds", label: "Refund & Cancellation" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/data-deletion", label: "Data Deletion" },
  { href: "/contact", label: "Contact" },
] as const;
