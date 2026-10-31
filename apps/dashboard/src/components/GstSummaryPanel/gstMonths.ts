import { isMonthKey } from "@/lib/istMonths";

export { istMonthNow, monthLabel, monthRangeLabel, shiftMonth } from "@/lib/istMonths";

/** GST began in India on 1 July 2017, so no earlier month can have GST bills. */
export const GST_START_MONTH = "2017-07";

/** A complete `YYYY-MM` from the start of GST up to the current month. */
export function isReportableMonth(month: string, currentMonth: string): boolean {
  return isMonthKey(month) && month >= GST_START_MONTH && month <= currentMonth;
}
