"use client";

import { Segmented } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";

import DashboardHome from "@/components/DashboardHome/DashboardHome";
import GstSummaryPanel from "@/components/GstSummaryPanel/GstSummaryPanel";
import ReportsHome from "@/components/ReportsHome/ReportsHome";
import { useAuth } from "@/contexts/AuthContext";

type WorkspaceTab = "overview" | "analytics" | "gst";

function tabFromSearchParams(searchParams: { get: (k: string) => string | null }): WorkspaceTab {
  const t = searchParams.get("tab");
  if (t === "analytics") return "analytics";
  if (t === "gst") return "gst";
  return "overview";
}

export default function DashboardWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { permissions } = useAuth();

  const canOverview = permissions?.canAccessDashboard ?? true;
  const canAnalytics = permissions?.canAccessReports ?? true;

  const tabFromUrl = useMemo(
    () => tabFromSearchParams(searchParams),
    [searchParams],
  );

  const visibleTabCount = useMemo(() => {
    return (canOverview ? 1 : 0) + (canAnalytics ? 2 : 0);
  }, [canOverview, canAnalytics]);

  const activeView: WorkspaceTab = useMemo(() => {
    if (canAnalytics && tabFromUrl === "gst") return "gst";
    if (tabFromUrl === "analytics" && canAnalytics) return "analytics";
    if (tabFromUrl === "overview" && canOverview) return "overview";
    if (canAnalytics && !canOverview) return "analytics";
    return "overview";
  }, [tabFromUrl, canOverview, canAnalytics]);

  useEffect(() => {
    if (!permissions) return;
    if (tabFromUrl === "analytics" && !canAnalytics) {
      router.replace("/dashboard", { scroll: false });
    } else if (tabFromUrl === "gst" && !canAnalytics) {
      router.replace("/dashboard", { scroll: false });
    } else if (tabFromUrl === "overview" && !canOverview && canAnalytics) {
      router.replace("/dashboard?tab=analytics", { scroll: false });
    }
  }, [permissions, tabFromUrl, canAnalytics, canOverview, router]);

  const showSwitcher = visibleTabCount > 1;

  const onTabChange = useCallback(
    (v: string | number) => {
      const s = String(v);
      if (s === "analytics") {
        router.replace("/dashboard?tab=analytics", { scroll: false });
      } else if (s === "gst") {
        router.replace("/dashboard?tab=gst", { scroll: false });
      } else {
        router.replace("/dashboard?tab=overview", { scroll: false });
      }
    },
    [router],
  );

  const segmentedOptions = useMemo(() => {
    const opts: { label: string; value: WorkspaceTab }[] = [];
    if (canOverview) {
      opts.push({ label: "Overview", value: "overview" });
    }
    if (canAnalytics) {
      opts.push({ label: "Analytics & reports", value: "analytics" });
      opts.push({ label: "GST summary", value: "gst" });
    }
    return opts;
  }, [canOverview, canAnalytics]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {showSwitcher ? (
        // Scrolls sideways on phones instead of overflowing off both edges.
        <div className="flex max-w-full shrink-0 overflow-x-auto [scrollbar-width:none]">
          <Segmented
            size="large"
            value={activeView}
            onChange={onTabChange}
            options={segmentedOptions}
          />
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {activeView === "overview" && canOverview ? (
          <DashboardHome />
        ) : null}
        {activeView === "analytics" && canAnalytics ? (
          <ReportsHome variant="embedded" />
        ) : null}
        {activeView === "gst" && canAnalytics ? (
          <GstSummaryPanel variant="embedded" />
        ) : null}
      </div>
    </div>
  );
}
