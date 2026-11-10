import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/Legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service | Fluxen POS",
  description:
    "The terms that apply when you create an account and use Fluxen POS for billing, inventory and shop management.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms are an agreement between you and ${LEGAL.operator} for your use of ${LEGAL.productName}. By creating an account or using the service you accept them.`}
    >
      <Section title="1. The service">
        <p>
          {LEGAL.productName} is software for billing at the counter, managing stock
          between a kitchen or factory and shops, and viewing sales reports. We may
          improve, change or retire features over time.
        </p>
      </Section>

      <Section title="2. Accounts and eligibility">
        <ul>
          <li>You must be at least 18 and able to enter a binding contract.</li>
          <li>
            You are responsible for the accuracy of your details and for everything done
            through your account, including by staff you add.
          </li>
          <li>
            Keep your password confidential and tell us promptly if you suspect misuse.
          </li>
          <li>
            The account owner decides which staff have access and what they can do.
          </li>
        </ul>
      </Section>

      <Section title="3. Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>break the law or use the service for fraud or to sell unlawful goods;</li>
          <li>
            attempt to access other businesses&apos; data, probe or disrupt the service,
            or bypass limits and security;
          </li>
          <li>upload malware or content you have no right to use;</li>
          <li>resell or white-label the service without our written consent.</li>
        </ul>
      </Section>

      <Section title="4. Your data">
        <p>
          You own the data you put into the service. You give us permission to host and
          process it only to provide the service to you. You are responsible for having
          the right to enter it, including your customers&apos; details, and for
          informing them as the law requires. Our{" "}
          <Link href="/privacy">Privacy Policy</Link> explains how we handle personal
          data. You can export your reports and ask us to delete your data at any time
          (<Link href="/data-deletion">Data Deletion</Link>).
        </p>
      </Section>

      <Section title="5. Tax and billing responsibilities">
        <p>
          The service helps you prepare bills and GST summaries, but you are responsible
          for the prices, tax rates and details you configure and for your own tax and
          legal compliance. We do not give tax or legal advice. Please check generated
          invoices and reports before relying on them.
        </p>
      </Section>

      <Section title="6. Payments">
        <p>
          Online payments are processed by Paytm under its own terms. We are not a bank
          or payment institution and are not a party to a sale between a shop and its
          customer. See our <Link href="/refunds">Refund &amp; Cancellation</Link>{" "}
          policy.
        </p>
      </Section>

      <Section title="7. Fees">
        <ul>
          <li>
            <strong>Free trial:</strong> every new business gets a 14-day free trial with
            all features, and no card is needed.
          </li>
          <li>
            <strong>After the trial:</strong> if you have not moved to a plan, your business
            becomes read-only. You can still sign in, view and export your data, but you
            cannot create bills or change products, stock or settings until a plan is
            activated. We do not delete your data because a trial ended.
          </li>
          <li>
            <strong>Plans:</strong> to continue, send a plan request from your account. We
            agree the plan and price with you and send an invoice. Nothing is charged
            automatically, and a plan starts only after you agree to it and pay.
          </li>
        </ul>
      </Section>

      <Section title="8. Demo account">
        <p>
          The &quot;Try the demo&quot; shop is shared by all visitors. Anyone can change
          it, and its data is reset regularly. Do not enter real customer or business
          data into it.
        </p>
      </Section>

      <Section title="9. Availability">
        <p>
          We work to keep the service running but do not promise it will be
          uninterrupted or error-free. We may suspend it for maintenance or security.
          Keep your own records for anything you cannot afford to lose.
        </p>
      </Section>

      <Section title="10. Suspension and termination">
        <p>
          You can stop using the service and close your account at any time. We may
          suspend or end access if you break these terms, put the service or other users
          at risk, or if the law requires. On termination your right to use the service
          ends; sections that by nature should continue (such as liability and governing
          law) continue.
        </p>
      </Section>

      <Section title="11. Disclaimers and liability">
        <p>
          The service is provided &quot;as is&quot; and &quot;as available&quot;. To the
          extent the law allows, we exclude implied warranties and are not liable for
          indirect or consequential loss, lost profit or lost data. Our total liability
          for any claim is limited to the amount you paid us for the service in the 12
          months before the claim. Nothing in these terms limits liability that cannot
          be limited by law.
        </p>
      </Section>

      <Section title="12. Indemnity">
        <p>
          You will cover losses we suffer from claims arising out of your misuse of the
          service, your breach of these terms, or data you entered without the right to
          do so.
        </p>
      </Section>

      <Section title="13. Governing law">
        <p>
          These terms are governed by the laws of India. The courts of India with
          competent jurisdiction will decide disputes, after we first try to resolve
          them informally by email.
        </p>
      </Section>

      <Section title="14. Changes and contact">
        <p>
          We may update these terms and will change the effective date above; for
          material changes we will notify account owners by email. Continuing to use the
          service after a change means you accept it. Questions:{" "}
          <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
