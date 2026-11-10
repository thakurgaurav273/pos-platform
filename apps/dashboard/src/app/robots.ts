import type { MetadataRoute } from "next";
import { LEGAL } from "@/lib/legal";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Signed-in app and API; nothing there is meant for search.
        disallow: ["/api/", "/dashboard", "/billing-pos", "/orders", "/settings", "/operator"],
      },
    ],
    sitemap: `${LEGAL.siteUrl}/sitemap.xml`,
  };
}
