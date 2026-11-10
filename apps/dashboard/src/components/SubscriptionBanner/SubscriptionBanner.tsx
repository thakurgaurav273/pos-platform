"use client";

import Link from "next/link";
import { Clock, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";

const TONES = {
  info: "border-[rgba(var(--ochre-rgb),0.3)] bg-[rgba(var(--ochre-rgb),0.08)] text-[var(--text-primary)]",
  warn: "border-[rgba(var(--ochre-rgb),0.55)] bg-[rgba(var(--ochre-rgb),0.16)] text-[var(--text-primary)]",
  danger: "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]",
} as const;

const plural = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** Slim notice above every page: trial countdown, plan ending soon, or read-only mode. */
export function SubscriptionBanner() {
  const { status } = useSubscription();
  const { user } = useAuth();
  if (!status) return null;

  const days = status.daysLeft ?? 0;
  let tone: keyof typeof TONES;
  let text: string;
  if (status.state === "TRIAL") {
    tone = days <= 3 ? "warn" : "info";
    text = `Free trial: ${plural(days)} left.`;
  } else if (status.state === "EXPIRED") {
    tone = "danger";
    text =
      "Your trial has ended. You can still view and export your data, but changes are turned off.";
  } else if (status.state === "ACTIVE" && status.daysLeft !== null && days <= 7) {
    tone = "warn";
    text = `Your plan ends in ${plural(days)}.`;
  } else {
    return null;
  }

  const canRequest = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
  const Icon = status.state === "EXPIRED" ? Lock : Clock;

  return (
    <div
      role="status"
      className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-2.5 text-sm ${TONES[tone]}`}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="font-medium">{text}</span>
      {canRequest ? (
        <Link
          href="/billing"
          className="ml-auto font-semibold underline underline-offset-2"
        >
          {status.state === "ACTIVE" ? "Renew" : "Request a plan"}
        </Link>
      ) : (
        <span className="ml-auto opacity-80">Ask your shop owner to request a plan.</span>
      )}
    </div>
  );
}
