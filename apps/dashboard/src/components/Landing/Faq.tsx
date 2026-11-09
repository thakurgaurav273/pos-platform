"use client";

import { useId, useState } from "react";
import { motion } from "framer-motion";
import { EASE_OUT } from "@/components/motion/MotionRoot";
import styles from "./Landing.module.css";

type Item = { q: string; a: string };

/**
 * Accordion with animated height. Every answer is in the DOM (collapsed with height 0)
 * so crawlers and screen readers can reach it; closed panels are `inert`.
 */
export function Faq({ items }: { items: readonly Item[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();

  return (
    <div className={styles.faq}>
      {items.map((f, i) => {
        const isOpen = open === i;
        const panelId = `${base}-p${i}`;
        return (
          <div key={f.q} className={styles.faqItem}>
            <h3>
              <button
                type="button"
                className={styles.faqBtn}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span>{f.q}</span>
                <motion.span className={styles.faqIcon} animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.2, ease: EASE_OUT }} aria-hidden>
                  +
                </motion.span>
              </button>
            </h3>
            <motion.div
              id={panelId}
              role="region"
              data-faq-panel
              inert={!isOpen}
              initial={false}
              animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
              transition={{ duration: 0.28, ease: EASE_OUT }}
              style={{ overflow: "hidden" }}
            >
              <p>{f.a}</p>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
