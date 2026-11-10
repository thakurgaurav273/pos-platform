import type { MetadataRoute } from "next";
import { LEGAL, LEGAL_LINKS } from "@/lib/legal";

/** Public pages only; the signed-in app is not listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", "/login", "/signup", ...LEGAL_LINKS.map((l) => l.href)];
  return paths.map((path) => ({
    url: `${LEGAL.siteUrl}${path === "/" ? "" : path}`,
    changeFrequency: path === "/" ? "weekly" : "yearly",
    priority: path === "/" ? 1 : path === "/signup" ? 0.8 : 0.4,
  }));
}
