"use client";

import { motion } from "framer-motion";
import { EASE_OUT } from "./MotionRoot";

type RevealProps = {
  children: React.ReactNode;
  /** Seconds to wait; use small steps (0.05 to 0.08) to stagger siblings. */
  delay?: number;
  /** Rise distance in px. Keep it small so it reads as a fade, not a slide. */
  y?: number;
  as?: "div" | "li" | "section" | "header" | "p";
  className?: string;
};

const TAGS = { div: motion.div, li: motion.li, section: motion.section, header: motion.header, p: motion.p } as const;

/**
 * Fades content up once as it enters the viewport (300-400ms, ease-out).
 * `data-reveal` lets the <noscript> rule in Landing show it if JavaScript is off.
 */
export function Reveal({ children, delay = 0, y = 12, as = "div", className }: RevealProps) {
  const Tag = TAGS[as];
  return (
    <Tag
      data-reveal
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.38, delay, ease: EASE_OUT }}
    >
      {children}
    </Tag>
  );
}
