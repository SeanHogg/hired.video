import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { SearchFilters } from "@/components/SearchBar";
import { useHeaderFilters } from "@/lib/header-filters";
import { useSearchQueryParam } from "@/hooks/use-search-query-param";

/**
 * /people search filters: registers the header filter chips and mirrors the
 * URL (?q / role / skills / openToWork / location) into `searchFilters`.
 */
export function usePeopleSearchFilters() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  // 2-char threshold via the shared hook so single-keystroke ?q=A
  // doesn't fire /api/users/public. Header search owns the visible
  // input — this page only consumes the resolved filter.
  const { effective: urlQuery } = useSearchQueryParam();
  const urlRole = searchParams.get("role") ?? "";
  const urlSkills = searchParams.get("skills") ?? "";
  const urlOpenToWork = searchParams.get("openToWork") ?? "";
  const urlLocation = searchParams.get("location") ?? "";

  useHeaderFilters([
    {
      key: "role",
      label: t("fields.industry.label"),
      type: "select",
      options: [
        { value: "job_seeker", label: t("labels.jobSeekers") },
        { value: "recruiter", label: t("labels.recruiters") },
        { value: "employer", label: t("labels.employers") },
        { value: "creator", label: t("labels.creators") },
        { value: "affiliate", label: t("labels.affiliates") },
      ],
    },
    {
      key: "skills",
      label: t("fields.skills.label"),
      type: "text",
      placeholder: t("fields.skills.placeholder"),
    },
    { key: "openToWork", label: t("fields.openToWork.label"), type: "boolean" },
  ]);

  const [searchFilters, setSearchFilters] = useState<SearchFilters>(() => {
    const initial: SearchFilters = {};
    if (urlQuery) initial.search = urlQuery;
    if (urlRole) initial.role = urlRole;
    if (urlSkills) initial.skills = urlSkills;
    if (urlOpenToWork) initial.openToWork = urlOpenToWork === "true";
    if (urlLocation) initial.location = urlLocation;
    return initial;
  });
  useEffect(() => {
    setSearchFilters((prev) => ({
      ...prev,
      search: urlQuery,
      role: urlRole || undefined,
      skills: urlSkills || undefined,
      openToWork: urlOpenToWork ? urlOpenToWork === "true" : undefined,
      location: urlLocation || undefined,
    }));
  }, [urlQuery, urlRole, urlSkills, urlOpenToWork, urlLocation]);

  return { searchFilters, setSearchFilters };
}
