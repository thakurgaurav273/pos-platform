import Link from "next/link";
import { useId, type ReactNode } from "react";
import styles from "./SectionCard.module.css";

type SectionCardProps = {
  title: ReactNode;
  /** One short line under the title. */
  description?: ReactNode;
  /** Right side of the header: a link, filter or small control. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** A titled block of content in one bordered card, used on dashboards and reports. */
export function SectionCard({ title, description, action, children, className }: SectionCardProps) {
  const titleId = useId();
  return (
    <section className={`${styles.card} ${className ?? ""}`.trim()} aria-labelledby={titleId}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {action ? <div className={styles.action}>{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** "View all"-style link for a SectionCard header. */
export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={styles.link}>
      {children}
    </Link>
  );
}
