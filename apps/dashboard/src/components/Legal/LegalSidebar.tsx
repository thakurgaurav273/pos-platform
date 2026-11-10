"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEGAL_LINKS } from "@/lib/legal";
import styles from "./Legal.module.css";

/** Links between the policy pages; highlights the one being read. */
export function LegalSidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Policies" className={styles.sidebar}>
      <p className={styles.sideLabel}>Policies</p>
      <ul className={styles.sideList}>
        {LEGAL_LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`${styles.sideLink} ${active ? styles.sideLinkActive : ""}`}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
