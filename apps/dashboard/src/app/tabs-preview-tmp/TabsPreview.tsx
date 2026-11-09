"use client";

// TEMPORARY check for the page tabs and the list bottom gap. Delete this folder after use.
// Same layout as the app: sidebar, 64px header, then <main> with the classes AppLayout
// gives /products (content + contentInventoryList).

import { Suspense } from "react";
import DashboardWorkspace from "../(app)/dashboard/DashboardWorkspace";
import ProductsWorkspace from "../(app)/products/ProductsWorkspace";
import layoutStyles from "../(app)/AppLayout.module.css";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const NAMES = ["Besan Modak", "Bhakarwadi 1 Packet", "Bhujia Sev (Haldiram)", "Bisk Farm Googly Bite Biscuit", "Kaju Barfi", "Rosogolla", "Mishti Doi", "Sandesh"];
const SKUS = Array.from({ length: 40 }, (_, i) => ({
  id: `v${i}`,
  productName: NAMES[i % NAMES.length],
  variantName: ["Regular", "1kg", "200g", "600g", "208g"][i % 5],
  category: ["Sweets", "Namkeen", "Bakery"][i % 3],
  sku: i % 4 === 0 ? `SWT-${100 + i}` : null,
  barcode: `${(0x3222199e + i * 7919).toString(16)}-d017-4190-859b-c486dcafbb${String(i).padStart(2, "0")}`,
  quantity: i % 9 === 0 ? 0 : i % 7 === 0 ? 4 : 100,
  minStock: i % 3 === 0 ? 10 : null,
  unit: i % 5 === 1 ? "KG" : "PC",
  price: 50 + i,
  imageUrl: null,
}));
const PRODUCTS = NAMES.map((name, i) => ({
  id: `p${i}`, name, description: null, categoryId: "c", shopCode: "SH000001", isActive: true, createdAt: "", updatedAt: "",
  category: { id: "c", name: "Sweets" },
  variants: [{ id: `v${i}`, name: "Regular", price: 60 + i, costPrice: null, barcode: "1", sku: null, hsnCode: null, quantity: 100, minStock: null, unit: "PC" }],
}));

if (typeof window !== "undefined") {
  localStorage.setItem(
    "fluxen_auth",
    JSON.stringify({
      token: "preview-token",
      user: { id: "preview", email: "admin@example.com", name: "Local Admin", role: "SUPER_ADMIN", shopCode: "SH000001" },
      permissions: {
        canAccessDashboard: true, canAccessBilling: true, canAccessOrders: true, canAccessProducts: true,
        canAccessInventory: true, canAccessCategories: true, canAccessReports: true, canAccessUsers: true,
        canAccessSettings: true,
      },
    }),
  );
  localStorage.setItem("fluxen_effective_shop", "SH000001");
  localStorage.setItem("fluxen_color_mode", "light");

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url, window.location.origin);
    if (u.pathname.endsWith("/api/inventory/variants")) {
      return json({ data: SKUS, page: 1, size: 40, total: 360, last_page: 9 });
    }
    if (u.pathname.endsWith("/api/products")) {
      return json({ data: PRODUCTS, page: 1, size: 40, total: PRODUCTS.length, last_page: 1, hasMore: false });
    }
    if (url.includes("/api/")) return json({ message: "preview" }, 503);
    return realFetch(input, init);
  };

  // Report the gap between the table's bottom edge and the bottom of the window.
  window.setTimeout(() => {
    const pager = document.querySelector<HTMLElement>("nav[aria-label='Pagination']");
    const table = pager?.closest<HTMLElement>("[class*='DataTable'][class*='root']");
    const list = document.querySelector<HTMLElement>("[class*='rowStack']");
    const box = (table ?? list)?.getBoundingClientRect();
    document.documentElement.dataset.gap = box ? `${Math.round(window.innerHeight - box.bottom)}` : "none";
    const wide = Array.from(document.querySelectorAll<HTMLElement>("main *")).filter(
      (el) => el.getBoundingClientRect().right > (document.querySelector("main")?.getBoundingClientRect().right ?? 0) + 1,
    );
    document.documentElement.dataset.overflow = wide.length ? `${wide.length} elements` : "none";
  }, 3000);
}

export function TabsPreview({ view }: { view: string }) {
  return (
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden" }}>
      <div style={{ width: 168, flexShrink: 0, background: "var(--ochre-700)" }} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div style={{ height: 64, flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--surface)" }} />
        <main
          className={`flex min-h-0 flex-1 flex-col p-4 sm:p-6 lg:px-8 lg:py-7 ${layoutStyles.content} ${view === "dashboard" ? "" : layoutStyles.contentInventoryList}`}
        >
          <div className="flex h-full min-h-0 flex-1 flex-col">
            <Suspense>{view === "dashboard" ? <DashboardWorkspace /> : <ProductsWorkspace />}</Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
