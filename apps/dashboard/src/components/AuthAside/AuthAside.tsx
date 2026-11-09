import styles from "./AuthAside.module.css";

/** Left side of the sign-in and sign-up cards: a flat brand panel with short pointers. */
export function AuthAside({ heading, points }: { heading: string; points: readonly string[] }) {
  return (
    <aside className={styles.aside}>
      <h2 className={styles.heading}>{heading}</h2>
      <ul className={styles.points}>
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </aside>
  );
}

export const AUTH_POINTS = [
  "Billing with barcode, UPI, card and split payments",
  "GST invoices and thermal receipts",
  "Refills from your kitchen to every shop",
  "Separate stock, staff and bills for each shop",
  "Set up in about five minutes",
] as const;
