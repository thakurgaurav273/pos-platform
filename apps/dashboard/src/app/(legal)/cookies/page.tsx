import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/Legal/LegalPage";

export const metadata: Metadata = {
  title: "Cookie Policy | Fluxen POS",
  description:
    "The cookies and browser storage Fluxen POS uses, and how to control them.",
};

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      intro="We keep this simple: we only use what is needed to sign you in and remember your settings."
    >
      <Section title="1. What we use">
        <ul>
          <li>
            <strong>Sign-in session:</strong> a token in your browser that keeps you
            signed in, so you do not have to log in on every page.
          </li>
          <li>
            <strong>Preferences:</strong> your active shop and your chosen theme and
            appearance, so the app looks and behaves the way you left it.
          </li>
        </ul>
        <p>
          These are strictly necessary for the service to work, so they do not need a
          consent banner.
        </p>
      </Section>

      <Section title="2. What we do not use">
        <p>
          We do not use advertising cookies, cross-site tracking or analytics cookies
          at this time. Our fonts are served from our own site. If we add analytics in
          future we will update this page and ask for your consent first.
        </p>
      </Section>

      <Section title="3. Third parties">
        <p>
          When you pay online, the payment page is run by Paytm and may set its own
          cookies under its own policy. Images such as logos and product photos are
          served by Cloudinary, which receives your IP address when your browser loads
          them.
        </p>
      </Section>

      <Section title="4. Controlling them">
        <p>
          You can clear or block cookies and site storage in your browser settings.
          Doing so signs you out and resets your preferences, and blocking them
          completely will stop sign-in from working.
        </p>
      </Section>

      <Section title="5. More information">
        <p>
          See our <Link href="/privacy">Privacy Policy</Link> for how we handle personal
          data.
        </p>
      </Section>
    </LegalPage>
  );
}
