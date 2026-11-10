import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fluxen Admin",
  description: "Operator console",
  robots: { index: false, follow: false },
};

export default function OperatorRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
