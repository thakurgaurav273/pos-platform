import { formatInrFull } from "@/lib/chartFormat";
import { paymentLabel } from "@/lib/payments";
import styles from "./PaymentMixList.module.css";

export type PaymentMixRow = { paymentMethod: string; orderCount: number; revenue: number };

const countFormat = new Intl.NumberFormat("en-IN");
const shareFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Revenue per payment mode, largest first, each with its share of the total and bill count. */
export function PaymentMixList({ rows, emptyText }: { rows: PaymentMixRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return <p className={styles.empty}>{emptyText}</p>;
  }
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const total = sorted.reduce((sum, r) => sum + r.revenue, 0);
  return (
    <ul className={styles.list}>
      {sorted.map((r) => {
        const share = total > 0 ? (r.revenue / total) * 100 : 0;
        return (
          <li key={r.paymentMethod} className={styles.row}>
            <div className={styles.top}>
              <span className={styles.label}>{paymentLabel(r.paymentMethod, "Other")}</span>
              <span className={styles.amount}>{formatInrFull(r.revenue)}</span>
            </div>
            <div className={styles.bar}>
              <span className={styles.track} aria-hidden>
                <span className={styles.fill} style={{ width: `${share}%` }} />
              </span>
              <span className={styles.meta}>
                {shareFormat.format(share)}% · {countFormat.format(r.orderCount)}{" "}
                {r.orderCount === 1 ? "bill" : "bills"}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
