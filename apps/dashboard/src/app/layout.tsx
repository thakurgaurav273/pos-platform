import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { THEME_PREPAINT_SCRIPT } from "@/lib/theme/storage";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/* Optional shop typography. Not preloaded: browsers fetch them only when a theme uses them. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  preload: false,
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Fluxen POS",
  description: "Billing, inventory and multi-shop management",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The pre-paint script sets theme variables and data-theme-mode on <html> before
    // hydration, hence suppressHydrationWarning.
    // Font variables live on <html> because the theme variables set there reference them.
    <html
      lang="en"
      data-theme-mode="light"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${playfair.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_PREPAINT_SCRIPT }} />
      </head>
      <body
        className="antialiased bg-[var(--linen)] min-h-screen"
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
