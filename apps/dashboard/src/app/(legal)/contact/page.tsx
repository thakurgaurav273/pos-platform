import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardGrid,
  EmailCta,
  LegalPage,
  Section,
} from "@/components/Legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contact Us | Fluxen POS",
  description:
    "How to reach Fluxen POS for support, privacy requests, billing questions and complaints.",
};

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact Us"
      intro="We read every message. Email is the fastest way to reach us, and we aim to reply within 3 working days."
    >
      <Section title="Email us">
        <EmailCta email={LEGAL.supportEmail} />
        <p style={{ marginTop: "0.9rem" }}>
          Please write from your registered email address and mention your business
          name so we can find your account quickly.
        </p>
      </Section>

      <Section title="What to write to us about">
        <CardGrid>
          <Card title="Support">
            <p>Help using billing, inventory, stock transfers or reports.</p>
          </Card>
          <Card title="Privacy and data requests">
            <p>
              Access, correction or <Link href="/data-deletion">deletion</Link> of your
              data, and privacy complaints.
            </p>
          </Card>
          <Card title="Billing and refunds">
            <p>
              See our <Link href="/refunds">Refund &amp; Cancellation Policy</Link>,
              then write to us with the details.
            </p>
          </Card>
          <Card title="Security">
            <p>
              Found a vulnerability? Email us the details and we will respond promptly.
            </p>
          </Card>
        </CardGrid>
      </Section>

      <Section title="Operator">
        <p>
          {LEGAL.productName} is operated by {LEGAL.operator}.
        </p>
        {LEGAL.address ? <p>{LEGAL.address}</p> : null}
      </Section>
    </LegalPage>
  );
}
