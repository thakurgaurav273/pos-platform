import Link from "next/link";
import { Metric, MetricStrip } from "@/components/MetricStrip/MetricStrip";
import { SectionCard } from "@/components/SectionCard/SectionCard";
import { formatInrFull } from "@/lib/chartFormat";
import type { GstSummaryPayload } from "./GstSummaryPanel";
import { monthLabel, monthRangeLabel } from "./gstMonths";
import styles from "./GstSummaryPanel.module.css";

const rateFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const shareFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const countFormat = new Intl.NumberFormat("en-IN");

function inr(n: number): string {
  return formatInrFull(Number.isFinite(n) ? n : 0);
}

function percent(n: number): string {
  return `${rateFormat.format(n)}%`;
}

type GstSummaryReportProps = {
  data: GstSummaryPayload;
  /** Current IST month, to flag a month that is still in progress. */
  currentMonth: string;
  /** Super admins can add a missing GSTIN in Settings → Shop profile. */
  canEditShopProfile: boolean;
};

/** Totals and tax by rate for one month that has bills. */
export function GstSummaryReport({
  data,
  currentMonth,
  canEditShopProfile,
}: GstSummaryReportProps) {
  const rates = data.byRate ?? [];
  const rateTaxTotal = rates.reduce((sum, r) => sum + r.tax, 0);

  return (
    <>
      <p className={styles.meta}>
        <span className={styles.metaStrong}>{data.shopName}</span>
        {data.gstNumber ? (
          <span>
            GSTIN <span className={styles.gstin}>{data.gstNumber}</span>
          </span>
        ) : (
          <span className={styles.metaWarning}>
            No GSTIN on file
            {canEditShopProfile ? (
              <>
                {" ("}
                <Link href="/settings?tab=shop" className={styles.metaLink}>
                  add it
                </Link>
                {")"}
              </>
            ) : null}
          </span>
        )}
        <span>
          {monthLabel(data.month)}
          {data.month === currentMonth ? (
            <span className={styles.badge}>Month to date</span>
          ) : null}
        </span>
        <span>
          {countFormat.format(data.billCount)} paid {data.billCount === 1 ? "bill" : "bills"}
        </span>
        {data.discountTotal > 0 ? <span>{inr(data.discountTotal)} in discounts</span> : null}
      </p>

      <MetricStrip label="GST totals">
        <Metric
          accent
          label="GST collected"
          value={inr(data.totalTax)}
          note="CGST + SGST on sales"
        />
        <Metric label="CGST" value={inr(data.cgstPayable)} note="Central tax" />
        <Metric label="SGST / UTGST" value={inr(data.sgstPayable)} note="State or union territory tax" />
        <Metric
          label="Taxable value"
          value={inr(data.taxableValue)}
          note={`From ${inr(data.grossInclusive)} sales incl. GST`}
        />
      </MetricStrip>

      {rates.length > 0 ? (
        <SectionCard
          title="Tax by GST rate"
          description="Uses the rate saved on each bill line at the time of sale."
        >
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">GST rate</th>
                  <th scope="col" className={styles.num}>
                    Tax collected
                  </th>
                  <th scope="col" className={styles.shareCol}>
                    Share of tax
                  </th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => {
                  const share = rateTaxTotal > 0 ? (r.tax / rateTaxTotal) * 100 : 0;
                  const half = percent(r.ratePercent / 2);
                  return (
                    <tr key={r.ratePercent}>
                      <td>
                        <div className={styles.rate}>{percent(r.ratePercent)}</div>
                        <div className={styles.rateSplit}>
                          {r.ratePercent > 0 ? `${half} CGST + ${half} SGST` : "Nil rated or exempt"}
                        </div>
                      </td>
                      <td className={styles.num}>{inr(r.tax)}</td>
                      <td>
                        <div className={styles.share}>
                          <span className={styles.shareTrack} aria-hidden>
                            <span className={styles.shareFill} style={{ width: `${share}%` }} />
                          </span>
                          <span className={styles.shareValue}>{shareFormat.format(share)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      <p className={styles.footnote}>
        {`Covers paid bills dated ${monthRangeLabel(data.month)} (IST). `}
        Interstate sales aren&apos;t tracked, so there is no IGST.
      </p>
    </>
  );
}
