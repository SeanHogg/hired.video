import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { parseOutreachTab, type OutreachTab } from "@/components/outreach/outreach-helpers";

/**
 * Tab state lives in the URL so deep-links / refresh / back-button work
 * and the breadcrumb tabs in the page header stay coherent with what the
 * user sees. Default surface is the Dashboard.
 */
export function useOutreachTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: OutreachTab = parseOutreachTab(searchParams.get("tab"));
  const setActiveTab = useCallback((next: OutreachTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: false });
  }, [searchParams, setSearchParams]);
  return { activeTab, setActiveTab };
}
