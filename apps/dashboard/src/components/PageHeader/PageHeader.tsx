import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

type PageHeaderProps = {
  title: ReactNode;
  /** One short sentence under the title. */
  description?: ReactNode;
  /** Primary actions, search or filters, aligned to the right on wide screens. */
  actions?: ReactNode;
  /** Small element before the title (e.g. a back link). */
  leading?: ReactNode;
  className?: string;
};

/**
 * Shared page title block: title + optional description on the left, actions on the
 * right, wrapping below on narrow screens. Server-component safe.
 */
export function PageHeader({ title, description, actions, leading, className }: PageHeaderProps) {
  return (
    <header className={`${styles.root} ${className ?? ""}`.trim()}>
      <div className={styles.text}>
        {leading && <div className={styles.leading}>{leading}</div>}
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
