// Browse-surface state for the /jobs hub: URL-bound search / geo / sector
// filters, view mode, the paginated public-jobs fetch and the ?list_id
// membership filter. Owns `jobs` so owner actions can prune rows.

import { useState, useEffect, useMemo } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSearchQueryParam } from "@/hooks/use-search-query-param";
import { usePagination } from "@/components/Pagination";
import type { SearchFilters } from "@/components/SearchBar";
import {
  locationFilterFromQuery,
  applyLocationFilterToQuery,
} from "@/components/location/LocationFilter";
import type { LocationFilter as LocationFilterValue } from "@/lib/services/locations-service";
import {
  sectorFilterFromQuery,
  applySectorFilterToQuery,
} from "@/components/sector/SectorFilter";
import { type Sector } from "@shared/sectors";
import { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { listsService } from "@/lib/services/lists-service";
import {
  jobService,
  type JobFilters,
  type JobSummary,
} from "@/lib/services/job-service";

export function useJobsBrowse(
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
) {
  const { t } = useTranslation();
  // `effective` applies the 2-char threshold so single-keystroke ?q=A
  // doesn't fire a full /api/jobs/public fanout. Raw value isn't needed
  // here — the header search component renders its own input from the
  // URL, this page only consumes the resolved filter.
  const { effective: urlQuery } = useSearchQueryParam();
  const urlEmploymentType = searchParams.get("employmentType") ?? "";
  const urlExperienceLevel = searchParams.get("experienceLevel") ?? "";
  const urlWorkSetting = searchParams.get("workSetting") ?? "";
  const urlRemote = searchParams.get("remote") ?? "";
  const urlSalaryMin = searchParams.get("salaryMin") ?? "";
  const urlSalaryMax = searchParams.get("salaryMax") ?? "";
  const urlLocation = searchParams.get("location") ?? "";

  const [searchFilters, setSearchFilters] = useState<SearchFilters>(() => {
    const initial: SearchFilters = {};
    if (urlQuery) initial.search = urlQuery;
    if (urlEmploymentType) initial.employmentType = urlEmploymentType;
    if (urlExperienceLevel) initial.experienceLevel = urlExperienceLevel;
    if (urlWorkSetting) initial.workSetting = urlWorkSetting;
    if (urlRemote) initial.remote = urlRemote === "true";
    if (urlSalaryMin) initial.salaryMin = parseInt(urlSalaryMin, 10);
    if (urlSalaryMax) initial.salaryMax = parseInt(urlSalaryMax, 10);
    if (urlLocation) initial.location = urlLocation;
    return initial;
  });
  useEffect(() => {
    setSearchFilters((prev) => ({
      ...prev,
      search: urlQuery,
      employmentType: urlEmploymentType || undefined,
      experienceLevel: urlExperienceLevel || undefined,
      workSetting: urlWorkSetting || undefined,
      remote: urlRemote ? urlRemote === "true" : undefined,
      salaryMin: urlSalaryMin ? parseInt(urlSalaryMin, 10) : undefined,
      salaryMax: urlSalaryMax ? parseInt(urlSalaryMax, 10) : undefined,
      location: urlLocation || undefined,
    }));
  }, [
    urlQuery,
    urlEmploymentType,
    urlExperienceLevel,
    urlWorkSetting,
    urlRemote,
    urlSalaryMin,
    urlSalaryMax,
    urlLocation,
  ]);
  // Structured geo filter — wired into URL so deep-links share state.
  // Falls back to the existing free-text `location` searchParam for
  // backwards compatibility with old saved searches + email-alert links.
  const [geoFilter, setGeoFilter] = useState<LocationFilterValue>(() =>
    locationFilterFromQuery(searchParams),
  );
  useEffect(() => {
    setGeoFilter(locationFilterFromQuery(searchParams));
  }, [searchParams]);
  const handleGeoFilterChange = (next: LocationFilterValue) => {
    setGeoFilter(next);
    const params = new URLSearchParams(searchParams);
    applyLocationFilterToQuery(params, next);
    setSearchParams(params);
  };

  // Sector filter (#1168). URL-bound so deep-links share state. Reuses
  // the partial sector index from migration 0112 server-side.
  const [sectorFilter, setSectorFilter] = useState<Sector | null>(() =>
    sectorFilterFromQuery(searchParams),
  );
  useEffect(() => {
    setSectorFilter(sectorFilterFromQuery(searchParams));
  }, [searchParams]);
  const handleSectorFilterChange = (next: Sector | null) => {
    setSectorFilter(next);
    const params = applySectorFilterToQuery(searchParams, next);
    setSearchParams(params);
  };

  const [viewMode, setViewMode] = useViewMode(
    "jobs.browse",
    "grid",
    BROWSE_VIEW_MODES,
  );
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  // Lists filter — same pattern as People page. Null = no filter; Set = restrict.
  const listIdFromUrl = searchParams.get("list_id");
  const [listMembership, setListMembership] = useState<Set<string> | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [totalJobs, setTotalJobs] = useState<number>(0);

  const pagination = usePagination(totalJobs, 9);
  const { currentPage, itemsPerPage, handleTotalItemsChange } = pagination;

  // The request's filter set, derived from state. The URL-sync effects
  // above always hand back fresh objects, so the fetch keys on the
  // SERIALIZED filters — one request per distinct filter set, never a
  // duplicate on mount (they used to fire /api/jobs/public twice).
  const jobFilters = useMemo<JobFilters>(
    () => ({
      search: searchFilters.search || undefined,
      // Free-text `location` is the legacy fallback — when the viewer picks
      // something in the LocationFilter the structured ids take over.
      location: geoFilter.text || searchFilters.location || undefined,
      countryId: geoFilter.countryId ?? undefined,
      stateId: geoFilter.stateId ?? undefined,
      cityId: geoFilter.cityId ?? undefined,
      radiusKm: geoFilter.radiusKm ?? undefined,
      employmentType: searchFilters.employmentType || undefined,
      experienceLevel: searchFilters.experienceLevel || undefined,
      workSetting: searchFilters.workSetting || undefined,
      isRemote: geoFilter.remote ?? searchFilters.remote ?? undefined,
      sector: sectorFilter ?? undefined,
      page: currentPage,
      limit: itemsPerPage,
    }),
    [searchFilters, geoFilter, sectorFilter, currentPage, itemsPerPage],
  );
  const jobFiltersKey = JSON.stringify(jobFilters);

  const fetchJobs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await jobService.getPublicJobs(jobFilters);
      setJobs(result.items);
      setTotalJobs(result.total);
      handleTotalItemsChange(result.total);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
      setError(t("errors.loadJobsFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch jobs when the effective filter set (or page) changes.
  useEffect(() => {
    fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobFiltersKey]);

  // Lists filter: load list membership when ?list_id changes.
  useEffect(() => {
    if (!listIdFromUrl) {
      setListMembership(null);
      return;
    }
    let cancelled = false;
    listsService
      .getItems(listIdFromUrl, "job")
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

  const displayedJobs = useMemo(
    () =>
      listMembership ? jobs.filter((j) => listMembership.has(j.id)) : jobs,
    [jobs, listMembership],
  );

  return {
    jobs,
    setJobs,
    displayedJobs,
    listMembership,
    isLoading,
    error,
    totalJobs,
    fetchJobs,
    clearFilters: () => setSearchFilters({}),
    geoFilter,
    handleGeoFilterChange,
    sectorFilter,
    handleSectorFilterChange,
    viewMode,
    setViewMode,
    pagination,
  };
}

export type JobsBrowseState = ReturnType<typeof useJobsBrowse>;
