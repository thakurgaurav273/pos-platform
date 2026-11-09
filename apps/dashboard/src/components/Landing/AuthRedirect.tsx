"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageBootstrapLoader } from "@/components/PageBootstrapLoader/PageBootstrapLoader";
import { useAuth } from "@/contexts/AuthContext";
import { useShop } from "@/contexts/ShopContext";
import { getFirstAllowedNavHref, isDashboardNavAllowed } from "@/lib/appNavAccess";

/**
 * The home page is public marketing. Visitors with a session skip it and land
 * where they would after signing in; everyone else sees the page untouched.
 */
export function AuthRedirect() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, permissions } = useAuth();
  const { effectiveShopCode, shops } = useShop();

  const isFactory = useMemo(
    () => !!shops.find((x) => x.shopCode === effectiveShopCode)?.isFactory,
    [shops, effectiveShopCode],
  );
  const navCtx = useMemo(() => ({ user, permissions, isFactory }), [user, permissions, isFactory]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (!user || !permissions || isDashboardNavAllowed(navCtx)) {
      router.replace("/dashboard");
      return;
    }
    router.replace(getFirstAllowedNavHref(navCtx) ?? "/access-denied?reason=no-access");
  }, [isAuthenticated, isLoading, user, permissions, navCtx, router]);

  if (isLoading || !isAuthenticated) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "var(--linen)" }}>
      <PageBootstrapLoader label="Loading" />
    </div>
  );
}
