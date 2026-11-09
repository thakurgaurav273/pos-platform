"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Typography } from "antd";
import { Home, ShieldAlert } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useShop } from "@/contexts/ShopContext";
import { getFirstAllowedNavHref, APP_NAV_ITEMS } from "@/lib/appNavAccess";
import styles from "./access-denied.module.css";

const { Title, Paragraph } = Typography;

function labelForPath(fromPath: string | null): string {
  if (!fromPath) return "this page";
  const item = APP_NAV_ITEMS.find(
    (i) => fromPath === i.prefix || fromPath.startsWith(`${i.prefix}/`),
  );
  return item?.sidebarLabel ?? fromPath;
}

export function AccessDeniedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, permissions } = useAuth();
  const { effectiveShopCode, shops } = useShop();

  const isFactory = useMemo(() => {
    const s = shops.find((x) => x.shopCode === effectiveShopCode);
    return !!s?.isFactory;
  }, [shops, effectiveShopCode]);

  const fromRaw = searchParams.get("from");
  const reason = searchParams.get("reason");

  const fromPath = useMemo(() => {
    if (!fromRaw) return null;
    try {
      const decoded = decodeURIComponent(fromRaw);
      if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;
      return decoded;
    } catch {
      return null;
    }
  }, [fromRaw]);

  const ctx = useMemo(
    () => ({ user, permissions, isFactory }),
    [user, permissions, isFactory],
  );

  const homeHref = useMemo(
    () => getFirstAllowedNavHref(ctx) ?? "/settings",
    [ctx],
  );

  const homeLabel = useMemo(() => {
    const item = APP_NAV_ITEMS.find((i) => i.prefix === homeHref);
    return item?.sidebarLabel ?? "Home";
  }, [homeHref]);

  const attemptedLabel = labelForPath(fromPath);

  const isNoAccess = reason === "no-access";

  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.iconWrap} aria-hidden>
          <ShieldAlert className={styles.icon} strokeWidth={1.75} />
        </div>
        <Title level={3} className={styles.title}>
          {isNoAccess ? "No areas enabled" : "You don’t have access"}
        </Title>
        <Paragraph className={styles.lead}>
          {isNoAccess ? (
            <>
              Your account doesn’t have permission to open any main sections.
              Ask an administrator to update your role or access flags.
            </>
          ) : (
            <>
              You can’t open <strong>{attemptedLabel}</strong> with your current
              permissions. If you think this is a mistake, contact your shop
              admin.
            </>
          )}
        </Paragraph>
        <div className={styles.actions}>
          <Button
            type="primary"
            className={styles.primaryBtn}
            icon={<Home className="size-4" aria-hidden />}
            onClick={() => router.push(homeHref)}
          >
            Go to {homeLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
