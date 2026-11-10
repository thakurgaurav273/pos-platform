import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/Legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Data Deletion | Fluxen POS",
  description:
    "How to delete your Fluxen POS account and data, what is removed, and what we may have to keep.",
};

export default function DataDeletionPage() {
  const subject = encodeURIComponent("Delete my Fluxen POS account");
  return (
    <LegalPage
      title="Data Deletion"
      intro="You can ask us to delete your account and the data in it at any time."
    >
      <Section title="Account owners">
        <ol>
          <li>
            Email{" "}
            <a href={`mailto:${LEGAL.supportEmail}?subject=${subject}`}>
              {LEGAL.supportEmail}
            </a>{" "}
            from the email address you registered with, with the subject &quot;Delete my
            Fluxen POS account&quot;.
          </li>
          <li>
            Include your business name. We may ask a question to confirm it is you.
          </li>
          <li>
            We delete the data within 30 days and confirm by email when it is done.
          </li>
        </ol>
        <p>
          Before you ask, export anything you want to keep, such as sales reports, from
          the dashboard. Deletion cannot be undone.
        </p>
      </Section>

      <Section title="What is deleted">
        <ul>
          <li>Your business, its shops and the staff accounts you created.</li>
          <li>Products, stock records, orders, invoices and customer records.</li>
          <li>Images you uploaded, such as logos and product photos.</li>
        </ul>
        <p>
          A super admin can also delete a single shop from the Shops page. That removes
          the shop together with its products, orders and staff.
        </p>
      </Section>

      <Section title="What we may keep">
        <p>
          We may keep limited records where the law requires it, or where needed to
          prevent fraud and resolve disputes. Backups are overwritten on their normal
          cycle. Anything kept is used only for those purposes.
        </p>
      </Section>

      <Section title="Staff members">
        <p>
          If you were added to a business by its owner, the owner controls that account.
          Ask them to remove it, or email us and we will pass your request on.
        </p>
      </Section>

      <Section title="Customers of a shop">
        <p>
          If a shop that uses {LEGAL.productName} holds your details, contact that shop to
          have them corrected or removed. You can also email us and we will help the shop
          action it.
        </p>
      </Section>

      <Section title="More">
        <p>
          See the <Link href="/privacy">Privacy Policy</Link> for your other rights, or{" "}
          <Link href="/contact">contact us</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
