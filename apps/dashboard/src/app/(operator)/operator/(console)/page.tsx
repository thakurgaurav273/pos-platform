"use client";

import Link from "next/link";
import { Tag } from "antd";
import styles from "@/components/Operator/Operator.module.css";
import { useOperatorData } from "@/components/Operator/useOperatorData";
import { fmtDate, fmtNum, type Overview } from "@/components/Operator/types";

function Stat({
  label,
  value,
  note,
  danger,
}: {
  label: string;
  value: number;
  note?: string;
  danger?: boolean;
}) {
  return (
    <div className={`${styles.stat} ${danger && value > 0 ? styles.statDanger : ""}`}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{fmtNum(value)}</div>
      {note ? <div className={styles.statNote}>{note}</div> : null}
    </div>
  );
}

export default function OverviewPage() {
  const { data, loading, error } = useOperatorData<Overview>("/overview");

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.h1}>Overview</h1>
          <p className={styles.sub}>Every business on the platform at a glance.</p>
        </div>
      </div>

      {error ? <p className={styles.loginError}>{error}</p> : null}
      {loading && !data ? <p className={styles.muted}>Loading…</p> : null}

      {data ? (
        <>
          <div className={styles.stats}>
            <Stat
              label="Businesses"
              value={data.totals.businesses}
              note={`+${data.totals.newLast7} this week · +${data.totals.newLast30} this month`}
            />
            <Stat label="In trial" value={data.totals.trial} />
            <Stat label="On a plan" value={data.totals.active} />
            <Stat label="Expired (read-only)" value={data.totals.expired} danger />
            <Stat label="Open plan requests" value={data.totals.openEnquiries} danger />
          </div>

          <div className={styles.grid2}>
            <section className={styles.card}>
              <div className={styles.cardHead}>
                Needs attention
                <span className={styles.cardHint}>Ending within 7 days</span>
              </div>
              {data.expiringSoon.length === 0 ? (
                <div className={styles.empty}>Nothing is about to expire.</div>
              ) : (
                <ul className={styles.list}>
                  {data.expiringSoon.map((o) => (
                    <li key={o.id} className={styles.item}>
                      <div>
                        <Link href={`/operator/businesses/${o.id}`} className={styles.itemLink}>
                          {o.name}
                        </Link>
                        <div className={styles.itemMeta}>
                          {o.state === "TRIAL" ? "Trial ends" : "Plan ends"} {fmtDate(o.endsAt)}
                        </div>
                      </div>
                      <Tag color={(o.daysLeft ?? 0) <= 2 ? "red" : "orange"}>
                        {o.daysLeft === 0 ? "today" : `${o.daysLeft}d left`}
                      </Tag>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.card}>
              <div className={styles.cardHead}>
                Open plan requests
                <Link href="/operator/requests" className={styles.itemLink}>
                  View all
                </Link>
              </div>
              {data.recentEnquiries.length === 0 ? (
                <div className={styles.empty}>No open requests.</div>
              ) : (
                <ul className={styles.list}>
                  {data.recentEnquiries.map((e) => (
                    <li key={e.id} className={styles.item}>
                      <div>
                        <Link
                          href={`/operator/businesses/${e.organization.id}`}
                          className={styles.itemLink}
                        >
                          {e.organization.name}
                        </Link>
                        <div className={styles.itemMeta}>
                          {e.contactName} · {e.email}
                          {e.plan ? ` · ${e.plan}` : ""}
                        </div>
                      </div>
                      <span className={styles.itemMeta}>{fmtDate(e.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              Recent signups
              <Link href="/operator/businesses" className={styles.itemLink}>
                All businesses
              </Link>
            </div>
            {data.recentSignups.length === 0 ? (
              <div className={styles.empty}>No businesses yet.</div>
            ) : (
              <ul className={styles.list}>
                {data.recentSignups.map((o) => (
                  <li key={o.id} className={styles.item}>
                    <Link href={`/operator/businesses/${o.id}`} className={styles.itemLink}>
                      {o.name}
                    </Link>
                    <span className={styles.itemMeta}>
                      {o.state === "TRIAL" ? "In trial" : o.state === "ACTIVE" ? "On a plan" : "Expired"}{" "}
                      · joined {fmtDate(o.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
