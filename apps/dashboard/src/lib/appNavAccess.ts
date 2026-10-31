import type { RolePermissions } from "@/contexts/AuthContext";

/** One navigable area: must stay in sync with API permission flags & sidebar. */
export type AppNavItem = {
  prefix: string;
  sidebarLabel?: string;
  permissionKey?: keyof RolePermissions;
  anyPermissionKeys?: (keyof RolePermissions)[];
  superAdminOnly?: boolean;
  allowedRoles?: string[];
  /** Match `AppLayout`: hide Stock transfers & Shops when the active shop is not factory. */
  factoryOnly?: boolean;
  /** e.g. `/logout` - any logged-in user */
  anyAuthenticated?: boolean;
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  /** Shown when another route is forbidden - not in sidebar */
  {
    prefix: "/access-denied",
    anyAuthenticated: true,
  },
  {
    prefix: "/logout",
    anyAuthenticated: true,
  },
  {
    prefix: "/dashboard",
    sidebarLabel: "Dashboard",
    anyPermissionKeys: ["canAccessDashboard", "canAccessReports"],
  },
  {
    prefix: "/reports/gst-summary",
    sidebarLabel: "GST summary",
    permissionKey: "canAccessReports",
  },
  {
    prefix: "/billing-pos",
    sidebarLabel: "Billing POS",
    permissionKey: "canAccessBilling",
  },
  {
    prefix: "/orders",
    sidebarLabel: "Orders",
    permissionKey: "canAccessOrders",
  },
  {
    prefix: "/customers",
    sidebarLabel: "Customers",
    anyPermissionKeys: ["canAccessBilling", "canAccessOrders"],
  },
  {
    /** Products and Stock tabs; each tab shows only with its own permission. */
    prefix: "/products",
    sidebarLabel: "Products",
    anyPermissionKeys: ["canAccessProducts", "canAccessInventory"],
  },
  {
    /** Variant edit pages. The stock list itself is the Stock tab of /products. */
    prefix: "/inventory",
    permissionKey: "canAccessInventory",
  },
  {
    prefix: "/stock-transfers",
    sidebarLabel: "Stock Transfers",
    permissionKey: "canAccessInventory",
    factoryOnly: true,
  },
  {
    prefix: "/categories",
    sidebarLabel: "Categories",
    permissionKey: "canAccessCategories",
  },
  {
    prefix: "/users",
    sidebarLabel: "Users",
    allowedRoles: ["SUPER_ADMIN", "ADMIN"],
  },
  {
    prefix: "/shops",
    sidebarLabel: "Shops",
    superAdminOnly: true,
    factoryOnly: true,
  },
  {
    prefix: "/settings",
    sidebarLabel: "Settings",
    permissionKey: "canAccessSettings",
  },
  {
    prefix: "/reports",
    permissionKey: "canAccessReports",
  },
];

export const SIDEBAR_ROUTE_PREFIXES = APP_NAV_ITEMS
  .filter((i) => i.sidebarLabel)
  .map((i) => i.prefix) as readonly string[];

export function matchAppNavItem(pathname: string): AppNavItem | null {
  let best: AppNavItem | null = null;
  let bestLen = -1;
  for (const item of APP_NAV_ITEMS) {
    const p = item.prefix;
    if (pathname === p || pathname.startsWith(`${p}/`)) {
      if (p.length > bestLen) {
        bestLen = p.length;
        best = item;
      }
    }
  }
  return best;
}

export type NavAccessContext = {
  user: { role?: string } | null;
  permissions: RolePermissions | null;
  isFactory: boolean;
};

export function isAppNavAllowed(
  item: AppNavItem,
  ctx: NavAccessContext,
): boolean {
  const { user, permissions, isFactory } = ctx;
  if (item.anyAuthenticated) {
    return !!user;
  }
  if (!user || !permissions) {
    return false;
  }
  if (item.allowedRoles?.length) {
    if (!user.role || !item.allowedRoles.includes(user.role)) {
      return false;
    }
  }
  if (item.superAdminOnly && user.role !== "SUPER_ADMIN") {
    return false;
  }
  if (item.anyPermissionKeys?.length) {
    if (!item.anyPermissionKeys.some((k) => permissions[k])) {
      return false;
    }
  } else if (item.permissionKey && !permissions[item.permissionKey]) {
    return false;
  }
  if (item.factoryOnly && !isFactory) {
    return false;
  }
  return true;
}

/** First sidebar destination the user may open (dashboard area, then billing, orders, …). */
export function getFirstAllowedNavHref(ctx: NavAccessContext): string | null {
  for (const item of APP_NAV_ITEMS) {
    if (!item.sidebarLabel || item.anyAuthenticated) {
      continue;
    }
    if (isAppNavAllowed(item, ctx)) {
      return item.prefix;
    }
  }
  return null;
}

/** Home / dashboard: prefer dashboard workspace when either overview or analytics is allowed. */
export function isDashboardNavAllowed(ctx: NavAccessContext): boolean {
  const dash = APP_NAV_ITEMS.find((i) => i.prefix === "/dashboard");
  if (!dash) return false;
  return isAppNavAllowed(dash, ctx);
}
