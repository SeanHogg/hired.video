import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import type { SearchFilters } from "@/components/SearchBar";
import { useHeaderFilters } from "@/lib/header-filters";
import { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { useSearchQueryParam } from "@/hooks/use-search-query-param";
import { listsService } from "@/lib/services/lists-service";

/**
 * URL-driven filters for the "My resumes" tab: header search + privacy /
 * type selects, the persisted browse view mode, and the Lists filter
 * (?list_id=…) resolved to a membership set.
 */
export function useResumeFilters() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  // 2-char threshold via the shared hook so single-keystroke ?q=A
  // doesn't fire /api/resumes/public. Header search owns the visible
  // input — this page only consumes the resolved filter.
  const { effective: urlQuery } = useSearchQueryParam();
  const urlPrivacy = searchParams.get("privacy") ?? "";
  const urlIsMaster = searchParams.get("isMaster") ?? "";

  useHeaderFilters([
    {
      key: "privacy",
      label: t("headings.privacy"),
      type: "select",
      options: [
        { value: "private", label: t("labels.privacy.private") },
        { value: "recruiter_only", label: t("labels.recruiterOnly") },
        { value: "public", label: t("labels.privacy.public") },
      ],
    },
    {
      key: "isMaster",
      label: t("labels.transactionType"),
      type: "select",
      options: [
        { value: "true", label: t("labels.master") },
        { value: "false", label: t("search.bar.resumeType.variation") },
      ],
    },
  ]);

  const [searchFilters, setSearchFilters] = useState<SearchFilters>(() => {
    const initial: SearchFilters = {};
    if (urlQuery) initial.search = urlQuery;
    if (urlPrivacy) initial.privacy = urlPrivacy;
    if (urlIsMaster) initial.isMaster = urlIsMaster === "true";
    return initial;
  });
  useEffect(() => {
    setSearchFilters((prev) => {
      const next: SearchFilters = { ...prev };
      next.search = urlQuery;
      next.privacy = urlPrivacy || undefined;
      next.isMaster = urlIsMaster ? urlIsMaster === "true" : undefined;
      return next;
    });
  }, [urlQuery, urlPrivacy, urlIsMaster]);
  const [viewMode, setViewMode] = useViewMode(
    "resumes.mine",
    "grid",
    BROWSE_VIEW_MODES,
  );
  // Lists filter — same pattern as People/Jobs.
  const listIdFromUrl = searchParams.get("list_id");
  const [listMembership, setListMembership] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!listIdFromUrl) {
      setListMembership(null);
      return;
    }
    let cancelled = false;
    listsService
      .getItems(listIdFromUrl, "resume")
      .then((res) => {
        if (cancelled) return;
        setListMembership(new Set(res.items.map((i) => i.entityId)));
      })
      .catch(() => {
        if (cancelled) return;
        setListMembership(null);
      });
    return () => {
      cancelled = true;
    };
  }, [listIdFromUrl]);

  return { searchFilters, viewMode, setViewMode, listMembership };
}
