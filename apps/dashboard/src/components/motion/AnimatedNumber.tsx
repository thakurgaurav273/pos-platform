"use client";

import { createElement, useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

const FORMATS = {
  int: (n: number) => String(Math.round(n)),
  inr0: (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`,
  inr2: (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
} as const;

type AnimatedNumberProps = {
  value: number;
  /** A formatter, or a named one (the only form a server component can pass). */
  format?: ((n: number) => string) | keyof typeof FORMATS;
  /** Tween length in seconds. Short on purpose: totals must stay readable while they move. */
  duration?: number;
  /** Count up from this number the first time the element scrolls into view (marketing use). */
  from?: number;
  as?: "span" | "tspan";
  className?: string;
};

/**
 * Tweens a figure to its new value without re-rendering per frame (writes textContent).
 * The server HTML always carries the final value, so crawlers and no-JS users see it.
 */
export function AnimatedNumber({ value, format: formatProp = "int", duration = 0.45, from, as = "span", className }: AnimatedNumberProps) {
  const format = typeof formatProp === "function" ? formatProp : FORMATS[formatProp];
  const ref = useRef<SVGTSpanElement & HTMLSpanElement>(null);
  const shown = useRef(value);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const set = (n: number) => {
      node.textContent = format(n);
    };
    if (reduce) {
      set(value);
      shown.current = value;
      return;
    }
    let start = shown.current;
    if (from !== undefined) {
      if (!inView) return;
      if (!started.current) {
        started.current = true;
        start = from;
      }
    }
    const controls = animate(start, value, { duration, ease: "easeOut", onUpdate: set });
    shown.current = value;
    return () => controls.stop();
    // format is intentionally omitted: callers pass inline lambdas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, inView, reduce, duration, from]);

  return createElement(as, { ref, className }, format(value));
}
