"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageBootstrapLoader } from "@/components/PageBootstrapLoader/PageBootstrapLoader";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

/**
 * First-run setup is for the business owner (SUPER_ADMIN) only, and only until it is
 * completed. Everyone else, or a finished business, goes straight to the dashboard.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!user) return;
    if (user.role !== "SUPER_ADMIN") {
      router.replace("/dashboard");
      return;
    }
    let cancelled = false;
    apiFetch("/organizations/current")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) throw new Error("org");
        const org = (await res.json()) as { onboardingCompleted: boolean };
        if (org.onboardingCompleted) router.replace("/dashboard");
        else setAllowed(true);
      })
      .catch(() => {
        // Can't tell: show the wizard rather than trapping the owner on a spinner.
        if (!cancelled) setAllowed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, user, router]);

  if (!allowed) return <PageBootstrapLoader label="Preparing your setup" />;
  return <>{children}</>;
}
