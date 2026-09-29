"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardContent } from "@/components/dashboard-content";
import { Shell } from "@/components/shell";
import { dashboardApi, type DashboardResponse } from "@/lib/api";

function DashboardPageContent() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false); setDashboard(null);
    dashboardApi.get().then(setDashboard).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    let mounted = true;
    dashboardApi.get().then((result) => { if (mounted) setDashboard(result); }).catch(() => { if (mounted) setFailed(true); });
    return () => { mounted = false; };
  }, []);
  if (failed) return <DashboardContent state="error" onRetry={load} />;
  return dashboard ? <DashboardContent state="ready" dashboard={dashboard} /> : <DashboardContent state="loading" />;
}

export default function DashboardPage() { return <AuthGuard>{(user) => <Shell user={user}><DashboardPageContent /></Shell>}</AuthGuard>; }
