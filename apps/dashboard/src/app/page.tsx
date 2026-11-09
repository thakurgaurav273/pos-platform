import type { Metadata } from "next";
import { AuthRedirect } from "@/components/Landing/AuthRedirect";
import { Landing } from "@/components/Landing/Landing";

export const metadata: Metadata = {
  title: "Fluxen POS | Billing, inventory and multi-shop management",
  description:
    "Run your factory and every shop from one place: GST-ready billing, live inventory, stock transfers, staff roles and reports. Built for Indian food and retail businesses.",
  openGraph: {
    title: "Fluxen POS: run every counter from one place",
    description: "POS, inventory, stock transfers and reports for businesses with one factory and many counters.",
    type: "website",
  },
};

export default function HomePage() {
  return (
    <>
      <Landing />
      <AuthRedirect />
    </>
  );
}
