import Link from "next/link";
import { FluxenLogo } from "@/components/FluxenLogo/FluxenLogo";
import { LEGAL, LEGAL_LINKS } from "@/lib/legal";
import styles from "./SiteFooter.module.css";

/** The one footer for every public page (homepage and policy pages). */
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <FluxenLogo size={24} />
        <nav className={styles.nav} aria-label="Legal">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={styles.link}>
              {l.label}
            </Link>
          ))}
        </nav>
        <p className={styles.copy}>
          © {new Date().getFullYear()} {LEGAL.productName}
        </p>
      </div>
    </footer>
  );
}
