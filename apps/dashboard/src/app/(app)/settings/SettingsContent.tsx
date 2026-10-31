"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Crown,
  IdCard,
  Palette,
  Percent,
  Shield,
  User,
  type LucideIcon,
} from "lucide-react";
import { PersonalDetails } from "./components/PersonalDetails";
import { SecuritySection } from "./components/SecuritySection";
import { RolesSection } from "./components/RolesSection";
import { TaxSettings } from "./components/TaxSettings";
import { ShopProfileSettings } from "./components/ShopProfileSettings";
import { AppearanceSettings } from "./components/AppearanceSettings";
import { RoleRequestsAdmin } from "./components/RoleRequestsAdmin";
import { useAuth } from "../../../contexts/AuthContext";
import styles from "./SettingsPage.module.css";

type SectionGroup = "Account" | "Shop" | "Administration";

type Section = {
  /** Also the `?tab=` value, so a section can be linked to and survives reload. */
  id: string;
  group: SectionGroup;
  label: string;
  description: string;
  icon: LucideIcon;
  render: () => React.ReactNode;
};

const GROUP_ORDER: SectionGroup[] = ["Account", "Shop", "Administration"];

/** Query param holding the active section, e.g. /settings?tab=security. */
const TAB_PARAM = "tab";

export function SettingsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isAtLeastManager =
    user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" || user?.role === "MANAGER";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  // Shop owners (ADMIN) and super admins may change branding; the API enforces the same rule.
  const canEditBranding = isSuperAdmin || user?.role === "ADMIN";

  // Same sections, in the same order, as the previous tab strip.
  const sections = useMemo<Section[]>(() => {
    const list: Section[] = [
      {
        id: "profile",
        group: "Account",
        label: "Personal details",
        description: "Your name, mobile number and photo as they appear across the app.",
        icon: User,
        render: () => <PersonalDetails />,
      },
      {
        id: "security",
        group: "Account",
        label: "Security",
        description: "Change your password and keep your account protected.",
        icon: Shield,
        render: () => <SecuritySection />,
      },
      {
        id: "roles",
        group: "Account",
        label: "Your roles & permissions",
        description: "What your role can do, and requests for a different role or extra access.",
        icon: IdCard,
        render: () => <RolesSection />,
      },
    ];
    if (isAtLeastManager) {
      list.push({
        id: "tax",
        group: "Shop",
        label: "Tax configuration",
        description: "GST rates applied to bills for the active shop.",
        icon: Percent,
        render: () => <TaxSettings />,
      });
    }
    if (canEditBranding) {
      list.push({
        id: "appearance",
        group: "Shop",
        label: "Appearance & branding",
        description: "Logo, theme, brand colours and light or dark mode for the active shop.",
        icon: Palette,
        render: () => <AppearanceSettings />,
      });
    }
    if (isSuperAdmin) {
      list.push(
        {
          id: "shop",
          group: "Shop",
          label: "Shop profile",
          description: "Business details for the active shop, including what prints on bills.",
          icon: Building2,
          render: () => <ShopProfileSettings />,
        },
        {
          id: "access-requests",
          group: "Administration",
          label: "Role & permissions management",
          description: "Review staff requests for role changes and extra permissions.",
          icon: Crown,
          render: () => <RoleRequestsAdmin />,
        },
      );
    }
    return list;
  }, [isAtLeastManager, isSuperAdmin, canEditBranding]);

  // The URL is the source of truth, so reloads, shared links and back/forward all agree.
  const tab = searchParams.get(TAB_PARAM);
  const active = sections.find((s) => s.id === tab) ?? sections[0];

  const select = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(TAB_PARAM, id);
    // Next.js syncs native replaceState into useSearchParams, without a server round trip.
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: sections.filter((s) => s.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <div className={styles.layout}>
      <nav className={styles.nav} aria-label="Settings sections">
        {grouped.map(({ group, items }) => (
          <div key={group} className={styles.navGroup}>
            <p className={styles.navGroupLabel}>{group}</p>
            <ul className={styles.navList}>
              {items.map((s) => {
                const Icon = s.icon;
                const isActive = s.id === active.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`.trim()}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => select(s.id)}
                    >
                      <Icon className={styles.navIcon} strokeWidth={1.8} aria-hidden />
                      <span>{s.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <section className={styles.panel} aria-labelledby="settings-section-title">
        <header className={styles.panelHeader}>
          <h2 id="settings-section-title" className={styles.panelTitle}>
            {active.label}
          </h2>
          <p className={styles.panelDescription}>{active.description}</p>
        </header>
        {/* key remounts the section when switching, so unsaved edits never leak across */}
        <div key={active.id} className={styles.panelBody}>
          {active.render()}
        </div>
      </section>
    </div>
  );
}
