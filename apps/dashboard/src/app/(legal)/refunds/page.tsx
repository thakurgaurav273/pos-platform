import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/Legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy | Fluxen POS",
  description:
    "How cancellations and refunds work for Fluxen POS fees and for online payments made to shops that use Fluxen POS.",
};

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund & Cancellation Policy"
      intro="This page covers two different things: fees you pay us, and payments a shopper makes to a shop that uses our software."
    >
      <Section title="1. Fees you pay to us">
        <ul>
          <li>
            <strong>Cancellation:</strong> you can cancel at any time by closing your
            account (see <Link href="/data-deletion">Data Deletion</Link>) or by
            emailing <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.
            If you are on a paid plan, access continues until the end of the period you
            have paid for.
          </li>
          <li>
            <strong>Refunds:</strong> fees already paid for a billing period are not
            refundable, except where we charged you in error, charged you twice, or the
            law requires a refund.
          </li>
          <li>
            <strong>Free trial:</strong> the 14-day trial is free, so there is nothing to
            refund. We do not charge automatically when it ends: the business becomes
            read-only until you agree a plan with us and pay its invoice.
          </li>
        </ul>
      </Section>

      <Section title="2. Payments made to a shop">
        <p>
          When a shopper pays a shop online through {LEGAL.productName}, the sale is
          between the shopper and that shop. The shop decides whether to cancel or
          refund an order under its own policy, and we are not the seller. Please
          contact the shop first.
        </p>
        <p>
          A refund the shop approves is returned to the original payment method through
          Paytm. Banks and card networks usually take 5 to 7 working days to show it.
        </p>
      </Section>

      <Section title="3. Failed or duplicate payments">
        <p>
          If money left your account but the order or payment did not complete, it is
          normally reversed automatically by the payment provider within a few working
          days. If it is not, email us the transaction ID, the amount, the date and the
          shop name and we will help trace it.
        </p>
      </Section>

      <Section title="4. How to ask">
        <p>
          Write to <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>{" "}
          from your registered email. We aim to reply within 3 working days and will
          confirm any refund we approve by email.
        </p>
      </Section>
    </LegalPage>
  );
}
