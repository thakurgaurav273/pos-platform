"use client";

import { MotionConfig } from "framer-motion";

/** One switch for the whole subtree: honour the OS "reduce motion" setting. */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** House easing: quick start, soft landing. Used for everything that enters. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
