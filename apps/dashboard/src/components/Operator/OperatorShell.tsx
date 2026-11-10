"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { Building2, Inbox, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import {
  clearSession,
  parseSession,
  readSessionRaw,
  subscribeSession,
} from "@/lib/operatorSession";
import styles from "./Operator.module.css";

const NAV = [
  { href: "/operator", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/operator/businesses", label: "Businesses", icon: Building2, exact: false },
  { href: "/operator/requests", label: "Plan requests", icon: Inbox, exact: false },
];

/** The admin center frame: its own sidebar, its own session, nothing from the shop app. */
export function OperatorShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const raw = useSyncExternalStore(subscribeSession, readSessionRaw, () => null);
  const session = parseSession(raw);

  useEffect(() => {
    if (mounted && !session) router.replace("/operator/login");
  }, [mounted, session, router]);

  if (!mounted || !session) return null;

  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <ShieldCheck size={18} aria-hidden />
          </span>
          <span>
            <span className={styles.brandName}>Fluxen Admin</span>
            <span className={styles.brandSub}>Operator console</span>
          </span>
        </div>

        <nav className={styles.nav} aria-label="Admin">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
              >
                <item.icon size={17} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.sideFooter}>
          <span className={styles.sideLabel}>Signed in as</span>
          <span className={styles.sideEmail}>{session.operator.name || session.operator.email}</span>
          <button type="button" className={styles.signOut} onClick={() => clearSession()}>
            <LogOut size={15} aria-hidden />
            Sign out
          </button>
        </div>
      </aside>

      <div className={styles.main}>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
