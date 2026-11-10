import Link from "next/link";
import type { ReactNode } from "react";
import { FluxenLogo } from "@/components/FluxenLogo/FluxenLogo";
import { SiteFooter } from "@/components/SiteFooter/SiteFooter";
import { LEGAL } from "@/lib/legal";
import { LegalSidebar } from "./LegalSidebar";
import styles from "./Legal.module.css";

type LegalPageProps = {
  title: string;
  /** One-sentence summary under the title. */
  intro?: string;
  children: ReactNode;
};

/** Shared shell for the public policy pages (no login required). */
export function LegalPage({ title, intro, children }: LegalPageProps) {
  return (
    <div className={styles.page} data-legal-page>
      <header className={styles.nav}>
        <div className={`${styles.wrap} ${styles.navInner}`}>
          <Link href="/" aria-label={`${LEGAL.productName} home`}>
            <FluxenLogo size={30} />
          </Link>
          <div className={styles.navActions}>
            <Link href="/login" className={styles.navLink}>
              Sign in
            </Link>
            <Link href="/signup" className={styles.navCta}>
              Create account
            </Link>
          </div>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.wrap}>
          <span className={styles.eyebrow}>Legal</span>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.meta}>Effective {LEGAL.effectiveDate}</p>
          {intro ? <p className={styles.lead}>{intro}</p> : null}
        </div>
      </section>

      <div className={`${styles.wrap} ${styles.layout}`}>
        <LegalSidebar />
        <main className={styles.content}>
          <article className={styles.article}>{children}</article>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>{title}</h2>
      {children}
    </section>
  );
}

/** Prominent email address with a mailto button (used on the contact page). */
export function EmailCta({ email }: { email: string }) {
  return (
    <div className={styles.emailBox}>
      <span className={styles.emailAddress}>{email}</span>
      <a className={styles.button} href={`mailto:${email}`}>
        Send an email
      </a>
    </div>
  );
}

/** Responsive grid of small info cards (used on the contact page). */
export function CardGrid({ children }: { children: ReactNode }) {
  return <div className={styles.cardGrid}>{children}</div>;
}

export function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>{title}</h3>
      <div className={styles.cardBody}>{children}</div>
    </div>
  );
}
