"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { App } from "antd";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, SUBSCRIPTION_EXPIRED_EVENT } from "@/lib/api";

/** Mirrors GET /billing/status. */
export type SubscriptionStatus = {
  state: "TRIAL" | "ACTIVE" | "EXPIRED";
  /** True once the trial or plan has ended: the business can look but not change. */
  readOnly: boolean;
  trialEndsAt: string | null;
  paidUntil: string | null;
  planName: string | null;
  daysLeft: number | null;
  openEnquiry: { createdAt: string; status: string } | null;
};

type SubscriptionContextValue = {
  status: SubscriptionStatus | null;
  refresh: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue>({
  status: null,
  refresh: async () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { message } = App.useApp();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const lastToastAt = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/billing/status");
      if (res.ok) setStatus((await res.json()) as SubscriptionStatus);
    } catch {
      // Offline or transient: keep whatever we last knew, never block the app.
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    apiFetch("/billing/status")
      .then(async (res) => {
        if (!cancelled && res.ok) setStatus((await res.json()) as SubscriptionStatus);
      })
      .catch(() => {
        // Offline or transient: never block the app on this.
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Any write the server refuses with 402 means the plan has just ended: refresh and tell the user once.
  useEffect(() => {
    const onExpired = () => {
      void refresh();
      if (Date.now() - lastToastAt.current < 8000) return;
      lastToastAt.current = Date.now();
      message.warning(
        "Your free trial has ended, so changes are turned off. Request a plan to continue.",
      );
    };
    window.addEventListener(SUBSCRIPTION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SUBSCRIPTION_EXPIRED_EVENT, onExpired);
  }, [refresh, message]);

  // After sign-out the old user's status must not linger for the next sign-in.
  const value = useMemo(
    () => ({ status: isAuthenticated ? status : null, refresh }),
    [isAuthenticated, status, refresh],
  );
  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}
