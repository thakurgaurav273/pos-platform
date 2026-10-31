"use client";

import { ChartColumn, LayoutDashboard, ReceiptIndianRupee } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import DashboardHome from "@/components/DashboardHome/DashboardHome";
import GstSummaryPanel from "@/components/GstSummaryPanel/GstSummaryPanel";
import { PageTabs, type PageTab } from "@/components/PageTabs/PageTabs";
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

  const tabs = useMemo(() => {
    const list: PageTab[] = [];
    if (canOverview) {
      list.push({ key: "overview", label: "Overview", href: "/dashboard?tab=overview", icon: LayoutDashboard });
    }
    if (canAnalytics) {
      list.push(
        { key: "analytics", label: "Analytics & reports", href: "/dashboard?tab=analytics", icon: ChartColumn },
        { key: "gst", label: "GST summary", href: "/dashboard?tab=gst", icon: ReceiptIndianRupee },
      );
    }
    return list;
  }, [canOverview, canAnalytics]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      {tabs.length > 1 ? <PageTabs label="Dashboard sections" tabs={tabs} active={activeView} /> : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {activeView === "overview" && canOverview ? (
          <DashboardHome />
        ) : null}
        {activeView === "analytics" && canAnalytics ? (
          <ReportsHome />
        ) : null}
        {activeView === "gst" && canAnalytics ? (
          <GstSummaryPanel variant="embedded" />
        ) : null}
      </div>
    </div>
  );
}
