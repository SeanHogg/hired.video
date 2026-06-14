/**
 * useUsageTracker (#2044) — records a page_view on every route change and runs
 * the tracker's periodic/unload flush. Mounted once in AppShell so every page
 * (marketing + authenticated) is covered with no per-page wiring. Self-gating:
 * the tracker no-ops without analytics consent.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { startUsageTracker, trackUsageEvent, flushUsage } from "@/lib/usage-tracker";

export function useUsageTracker(): void {
  const location = useLocation();

  useEffect(() => startUsageTracker(), []);

  useEffect(() => {
    trackUsageEvent("page_view", { path: location.pathname });
    // Flush soon after navigation so presence reflects the move quickly.
    const t = setTimeout(flushUsage, 1500);
    return () => clearTimeout(t);
  }, [location.pathname]);
}
