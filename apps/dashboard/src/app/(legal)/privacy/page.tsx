import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/Legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy | Fluxen POS",
  description:
    "What personal data Fluxen POS collects, why, who it is shared with, how long it is kept, and how to exercise your rights.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`This policy explains how ${LEGAL.operator} ("we", "us") handles personal data when you use ${LEGAL.productName}, our billing, inventory and shop management software.`}
    >
      <Section title="1. Who is responsible">
        <p>
          {LEGAL.operator} operates {LEGAL.productName} at {LEGAL.siteUrl}. For the
          account and business data you give us, we decide how it is used and are
          responsible for it. For data about <strong>your own customers</strong> that
          you enter into the product (see section 2), you decide why it is collected
          and we process it on your behalf.
        </p>
      </Section>

      <Section title="2. What we collect">
        <ul>
          <li>
            <strong>Account details:</strong> your name, email address, phone number,
            role, and a password that we store only as a one-way hash.
          </li>
          <li>
            <strong>Business details you enter:</strong> shop names, addresses, GST and
            FSSAI numbers, UPI and bank details printed on bills, products, prices,
            stock levels, orders and invoices.
          </li>
          <li>
            <strong>Your customers&apos; details:</strong> names, phone numbers, email
            addresses, GSTIN, notes and purchase history that you or your staff record.
          </li>
          <li>
            <strong>Staff accounts:</strong> the name, email, role and permissions you
            assign to your team members.
          </li>
          <li>
            <strong>Plan requests:</strong> the name, email, phone number and message you
            send when you ask for a paid plan, and the dates your trial and plan start and
            end.
          </li>
          <li>
            <strong>Images:</strong> shop logos and product photos you upload.
          </li>
          <li>
            <strong>Technical data:</strong> IP address, browser and device type, and
            server logs, used for security, abuse prevention and fixing faults.
          </li>
        </ul>
        <p>
          We do not see or store card or bank-account credentials used to pay online.
          Those are handled by our payment provider (section 4).
        </p>
      </Section>

      <Section title="3. How we use it">
        <ul>
          <li>To create and run your account, shops and billing.</li>
          <li>
            To send one-time passcodes, sign-up confirmations and other messages needed
            to operate your account.
          </li>
          <li>To keep the service secure, prevent fraud and limit abuse.</li>
          <li>To give support and respond to your requests.</li>
          <li>To maintain and improve the product, and to meet legal obligations.</li>
        </ul>
        <p>
          We do <strong>not</strong> sell personal data, and we do not use it for
          advertising. We do not currently offer &quot;Sign in with Google&quot; and do
          not access Google user data.
        </p>
      </Section>

      <Section title="4. Who we share it with">
        <p>
          We share data only with service providers that help us run the product, under
          their own privacy terms, and only as needed for that purpose:
        </p>
        <ul>
          <li>
            <strong>Resend</strong>, to deliver transactional emails such as one-time
            passcodes.
          </li>
          <li>
            <strong>Paytm</strong>, to process online payments.
          </li>
          <li>
            <strong>Cloudinary</strong>, to store and serve images you upload.
          </li>
          <li>
            <strong>Our hosting and infrastructure providers</strong>, where the
            application and database run.
          </li>
        </ul>
        <p>
          We may also disclose data when the law requires it, to protect rights and
          safety, or as part of a merger or sale of the business, in which case this
          policy continues to apply to your data.
        </p>
      </Section>

      <Section title="5. Cookies and local storage">
        <p>
          We use browser storage to keep you signed in and remember your shop and theme.
          We do not use advertising cookies. See our{" "}
          <Link href="/cookies">Cookie Policy</Link>.
        </p>
      </Section>

      <Section title="6. How long we keep it">
        <p>
          We keep account and business data while your account is active. When you ask
          us to delete it (see <Link href="/data-deletion">Data Deletion</Link>) we
          remove it within 30 days, except records we must keep by law or to resolve a
          dispute. Backups are overwritten on their normal cycle.
        </p>
      </Section>

      <Section title="7. Security">
        <p>
          Passwords are hashed, traffic is encrypted in transit, access is limited by
          role, and one-time passcodes expire quickly and are rate-limited. No system is
          perfectly secure, so please use a strong, unique password and keep staff
          accounts limited to the people who need them.
        </p>
      </Section>

      <Section title="8. Your rights">
        <p>
          Under applicable law, including India&apos;s Digital Personal Data Protection
          Act, 2023, you may ask to access, correct or erase your personal data, withdraw
          consent, and raise a grievance. Email{" "}
          <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a> from your
          registered address. To remove your data, use{" "}
          <Link href="/data-deletion">Data Deletion</Link>. If you are a customer of a
          shop that uses {LEGAL.productName}, please contact that shop first, as it
          decides how your data is used; we will assist them.
        </p>
      </Section>

      <Section title="9. Children">
        <p>
          {LEGAL.productName} is for businesses and is not directed at anyone under 18.
          We do not knowingly collect data from children.
        </p>
      </Section>

      <Section title="10. Where data is processed">
        <p>
          Data is processed on servers operated by us and our providers, which may be
          located in or outside India. We use providers that protect data to a comparable
          standard.
        </p>
      </Section>

      <Section title="11. Changes">
        <p>
          We will update this page when our practices change and revise the effective
          date above. For significant changes we will also notify account owners by
          email.
        </p>
      </Section>

      <Section title="12. Contact and grievances">
        <p>
          Questions or complaints about privacy:{" "}
          <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>. We
          acknowledge requests promptly and resolve them within the time the law
          allows. See also our <Link href="/contact">Contact</Link> page.
        </p>
      </Section>
    </LegalPage>
  );
}
