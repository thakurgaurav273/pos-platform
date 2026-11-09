"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useShop } from "@/contexts/ShopContext";
import { apiFetch } from "@/lib/api";
import {
  matchAppNavItem,
  isAppNavAllowed,
  getFirstAllowedNavHref,
  isDashboardNavAllowed,
} from "@/lib/appNavAccess";
import { PageBootstrapLoader } from "@/components/PageBootstrapLoader/PageBootstrapLoader";

const ACCESS_DENIED_PATH = "/access-denied";

const PROTECTED_PATHS = [
  "/dashboard",
  "/billing-pos",
  "/orders",
  "/products",
  "/inventory",
  "/categories",
  "/reports",
  "/users",
  "/settings",
  "/shops",
  "/logout",
  "/stock-transfers",
  ACCESS_DENIED_PATH,
];

function isProtectedPath(path: string) {
  if (path === "/") return true;
  return PROTECTED_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

function isDashboardEntryPath(pathname: string) {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

/**
 * Protects (app) routes. Wraps the full AppLayout so the session loader can cover
 * the entire viewport (sidebar + header + main), not only the content column.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading, user, permissions } = useAuth();
  const { effectiveShopCode, shops, shopsLoading } = useShop();
  // The shop list loads after the session, and this guard's effects run before ShopProvider's.
  // Until a shop is chosen, a factory-only page can't be judged yet (refreshing /shops used
  // to bounce to access-denied because the factory looked like a retail shop).
  const shopPending = shopsLoading || !effectiveShopCode;
  const redirectingRef = useRef(false);

  const isFactory = useMemo(() => {
    const s = shops.find((x) => x.shopCode === effectiveShopCode);
    return !!s?.isFactory;
  }, [shops, effectiveShopCode]);

  const navCtx = useMemo(
    () => ({ user, permissions, isFactory }),
    [user, permissions, isFactory],
  );

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated && isProtectedPath(pathname)) {
      router.replace("/login");
    }
  }, [pathname, isAuthenticated, isLoading, router]);

  useEffect(() => {
    redirectingRef.current = false;
  }, [pathname]);

  // A brand-new business owner finishes first-run setup before using the app.
  // "checking" holds the page back so the dashboard never flashes before the redirect.
  const isOwner = isAuthenticated && user?.role === "SUPER_ADMIN";
  const [setupState, setSetupState] = useState<"checking" | "done" | "needed">("checking");
  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    apiFetch("/organizations/current")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) return setSetupState("done");
        const org = (await res.json()) as { onboardingCompleted: boolean };
        if (org.onboardingCompleted) {
          setSetupState("done");
        } else {
          setSetupState("needed");
          router.replace("/onboarding");
        }
      })
      .catch(() => {
        // Offline or transient: never lock an existing owner out of the app.
        if (!cancelled) setSetupState("done");
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, router]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user || !permissions) return;
    if (!isProtectedPath(pathname)) return;
    if (pathname === ACCESS_DENIED_PATH) return;

    const rule = matchAppNavItem(pathname);
    if (!rule) {
      return;
    }
    if (rule.factoryOnly && shopPending) {
      return;
    }
    const allowed = isAppNavAllowed(rule, navCtx);
    if (allowed) {
      return;
    }

    if (redirectingRef.current) return;
    redirectingRef.current = true;

    if (isDashboardEntryPath(pathname)) {
      const next = getFirstAllowedNavHref(navCtx);
      if (next) {
        router.replace(next);
      } else {
        router.replace(`${ACCESS_DENIED_PATH}?reason=no-access`);
      }
      return;
    }

    router.replace(
      `${ACCESS_DENIED_PATH}?from=${encodeURIComponent(pathname)}`,
    );
  }, [
    pathname,
    isAuthenticated,
    isLoading,
    user,
    permissions,
    navCtx,
    isFactory,
    shopPending,
    router,
  ]);

  if (isLoading) {
    return <PageBootstrapLoader label="Loading session" />;
  }

  if (!isAuthenticated && isProtectedPath(pathname)) {
    return <PageBootstrapLoader label="Redirecting" />;
  }

  if (isOwner && setupState !== "done") {
    return <PageBootstrapLoader label={setupState === "needed" ? "Starting setup" : "Loading session"} />;
  }

  if (
    isAuthenticated &&
    user &&
    permissions &&
    isProtectedPath(pathname) &&
    pathname !== ACCESS_DENIED_PATH
  ) {
    const rule = matchAppNavItem(pathname);
    if (rule?.factoryOnly && shopPending) {
      return <PageBootstrapLoader label="Loading shop" />;
    }
    if (rule && !isAppNavAllowed(rule, navCtx)) {
      return <PageBootstrapLoader label="Redirecting" />;
    }
  }

  return <>{children}</>;
}
