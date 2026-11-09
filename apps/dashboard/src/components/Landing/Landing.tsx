import Image from "next/image";
import Link from "next/link";
import { FluxenLogo } from "@/components/FluxenLogo/FluxenLogo";
import { MotionRoot } from "@/components/motion/MotionRoot";
import { Reveal } from "@/components/motion/Reveal";
import { Faq } from "./Faq";
import styles from "./Landing.module.css";

const MORE = [
  ["Variants by weight and pack", "200 g, 1 kg or a box of twelve. Each variant has its own barcode, price, HSN code and stock count."],
  ["Refills between kitchen and shops", "A shop asks, the factory approves and sends it, and both inventories update. Every movement is recorded."],
  ["GST on every bill", "CGST and SGST are split, and your GSTIN, FSSAI number and UPI ID print on the invoice. The GST summary exports to Excel or PDF."],
  ["Staff and roles", "Owner, admin, manager, cashier and staff each see only their own screens. Staff can ask for more access and you approve it."],
  ["More than one shop", "Each shop keeps its own stock, staff and bills. Switch between them from the header."],
  ["Your colours", "Pick a theme or set your own colours and logo. Each shop can look different."],
] as const;

const FAQ = [
  {
    q: "Is it built for India?",
    a: "Yes. Prices are in rupees, bills split CGST and SGST, products carry HSN codes, and your GSTIN, FSSAI number and UPI ID print where they should.",
  },
  {
    q: "Can I run more than one shop?",
    a: "Yes. A business has one factory and any number of shops. Stock, staff and sales are tracked per shop, and you switch between them from the header.",
  },
  {
    q: "How does stock get from the factory to a shop?",
    a: "The shop raises a refill request, the factory approves it and then fulfils it. Quantities move between the two inventories and the movement is recorded.",
  },
  {
    q: "Who can see my data?",
    a: "Only people in your business. Each business is kept separate, and staff can open only the shop and screens their role allows.",
  },
  {
    q: "Do I need special hardware?",
    a: "No. It runs in the browser. A barcode scanner that types like a keyboard and a thermal receipt printer both work if you already have them.",
  },
] as const;

export function Landing() {
  return (
    <MotionRoot>
      <div className={styles.page}>
        {/* If JavaScript is off, nothing may stay hidden waiting for an animation. */}
        <noscript>
          <style>{"[data-reveal]{opacity:1!important;transform:none!important}[data-faq-panel]{height:auto!important;opacity:1!important}"}</style>
        </noscript>
        <a href="#main" className={styles.skipLink}>
          Skip to content
        </a>

        <header className={styles.nav}>
          <div className={styles.wrap}>
            <Link href="/" className={styles.brand} aria-label="Fluxen POS home">
              <FluxenLogo size={30} />
            </Link>
            <nav aria-label="Primary" className={styles.navLinks}>
              <a href="#features">Features</a>
              <a href="#faq">Questions</a>
            </nav>
            <div className={styles.navCta}>
              <Link href="/login" className={styles.textLink}>
                Sign in
              </Link>
              <Link href="/signup" className={styles.btn}>
                Create account
              </Link>
            </div>
          </div>
        </header>

        <main id="main">
          <section className={`${styles.wrap} ${styles.hero}`}>
            <h1 className={styles.h1}>Billing at the counter. Stock from the kitchen.</h1>
            <p className={styles.sub}>
              Fluxen POS is for shops that make what they sell. Ring up sales, keep stock in step between your kitchen and every counter, and see the day&apos;s numbers without a spreadsheet.
            </p>
            <div className={styles.actions}>
              <Link href="/signup" className={`${styles.btn} ${styles.btnLg}`}>
                Create account
              </Link>
              <Link href="/login" className={styles.textLink}>
                Sign in
              </Link>
            </div>
          </section>

          <div className={`${styles.wrap} ${styles.heroShot}`}>
            <Reveal y={16}>
              <Image
                src="/shots/pos.jpg"
                alt="The Fluxen POS billing screen: a product list on the left and the current sale with GST and the payable total on the right."
                width={2880}
                height={1800}
                priority
                sizes="(max-width: 1240px) 100vw, 1240px"
                className={styles.shot}
              />
            </Reveal>
          </div>

          <section id="features" className={styles.section} aria-labelledby="billing-h">
            <div className={`${styles.wrap} ${styles.feature}`}>
              <Reveal className={styles.featureText}>
                <h2 id="billing-h" className={styles.h2}>
                  A billing screen that keeps up with the queue
                </h2>
                <p>
                  Scan a barcode or search, take cash, UPI, card or a split, and print a GST invoice or a thermal receipt. Add a discount, attach a saved customer, and a sale in progress survives a page refresh.
                </p>
              </Reveal>
              <Reveal delay={0.08} className={`${styles.crop} ${styles.cropBill}`}>
                <Image
                  src="/shots/bill.jpg"
                  alt="The current sale: three items, CGST and SGST, a payable total of ₹1,140 and cash, UPI, card and split buttons."
                  width={830}
                  height={1080}
                  sizes="(max-width: 900px) 100vw, 420px"
                  className={styles.cropImg}
                />
              </Reveal>
            </div>

            <div className={`${styles.wrap} ${styles.feature} ${styles.flip}`}>
              <Reveal className={styles.featureText}>
                <h2 className={styles.h2}>See how the shop did, every day</h2>
                <p>
                  Revenue, bills, average bill and payment mix for any period, with a GST summary your accountant can use. Low stock shows up before the shelf is empty.
                </p>
              </Reveal>
              <Reveal delay={0.08} className={styles.crop}>
                <Image
                  src="/shots/reports.jpg"
                  alt="Revenue for the month, bills and average bill, with a bar chart of daily revenue."
                  width={2280}
                  height={1140}
                  sizes="(max-width: 900px) 100vw, 680px"
                  className={styles.cropImg}
                />
              </Reveal>
            </div>
          </section>

          <section className={`${styles.wrap} ${styles.more}`} aria-labelledby="more-h">
            <h2 id="more-h" className={styles.h2}>
              The rest of what a shop needs
            </h2>
            <dl className={styles.moreList}>
              {MORE.map(([term, desc]) => (
                <Reveal key={term} className={styles.moreRow}>
                  <dt>{term}</dt>
                  <dd>{desc}</dd>
                </Reveal>
              ))}
            </dl>
          </section>

          <section id="faq" className={`${styles.wrap} ${styles.faqSection}`} aria-labelledby="faq-h">
            <h2 id="faq-h" className={styles.h2}>
              Questions
            </h2>
            <Faq items={FAQ} />
          </section>

          <section className={`${styles.wrap} ${styles.cta}`} aria-labelledby="cta-h">
            <h2 id="cta-h" className={styles.h2}>
              Set up your first shop in about five minutes.
            </h2>
            <div className={styles.actions}>
              <Link href="/signup" className={`${styles.btn} ${styles.btnLg}`}>
                Create account
              </Link>
              <Link href="/login" className={styles.textLink}>
                Sign in
              </Link>
            </div>
          </section>
        </main>

        <footer className={styles.footer}>
          <div className={styles.wrap}>
            <FluxenLogo size={24} />
            <p>© {new Date().getFullYear()} Fluxen POS</p>
          </div>
        </footer>
      </div>
    </MotionRoot>
  );
}
