import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import styles from "./PageTabs.module.css";

export type PageTab = {
  key: string;
  label: string;
  href: string;
  icon?: LucideIcon;
};

/**
 * Section tabs at the top of a page (e.g. Products | Stock). Underlined links, so they
 * read as navigation and can't be mistaken for the filter toggles inside each section.
 */
export function PageTabs({
  tabs,
  active,
  label,
}: {
  tabs: PageTab[];
  active: string;
  /** Names the tab group for screen readers, e.g. "Products sections". */
  label: string;
}) {
  return (
    <nav aria-label={label} className={styles.bar}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            replace
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={`${styles.tab} ${isActive ? styles.active : ""}`.trim()}
          >
            {Icon ? <Icon size={17} strokeWidth={1.9} aria-hidden /> : null}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
