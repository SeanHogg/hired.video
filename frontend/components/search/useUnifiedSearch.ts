import { useState } from "react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import type ActionsModal from "@/components/ActionsModal";
import { type ServiceMarketplaceItem } from "@/components/ServiceMarketplaceCard";
import { apiClient } from "@/lib/api-client";
import { usePagination } from "@/components/Pagination";
import { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { useFeedCardRenderer, feedEntityHref } from "@/components/cards/feed-card-renderer";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { type SearchFilters } from "@/lib/services/search-service";
import {
  effectiveSearchQuery,
  fetchCardFeed,
  type CardFeedResponse,
} from "@/lib/card-feed";
import { resumeService } from "@/lib/services/resume-service";
import { isValidCompanyName } from "@/lib/utils/company-validation";
import { locationFilterFromQuery } from "@/components/location/LocationFilter";
import type { LocationFilter as LocationFilterValue } from "@/lib/services/locations-service";
import {
  categoryToTypes,
  compareSearchResults,
  matchesSearchFilters,
} from "@/lib/search/unified-search";

type ActionsModalProps = React.ComponentProps<typeof ActionsModal>;

/**
 * Services + courses live outside the card-feed pipeline. `suppressErrorEvent`
 * so a missing migration / unavailable endpoint doesn't fire the global
 * support-ticket toast — search just falls back to an empty list.
 */
async function fetchOptionalList(path: string, limit: number): Promise<any[]> {
  try {
    const res = await apiClient.get<any[]>(`${path}?limit=${limit}`, undefined, {
      suppressErrorEvent: true,
    });
    return res.data ?? [];
  } catch {
    return [];
  }
}

/** Drops demo/invalid companies, draft resumes, demo people; Creators = creator people only. */
function isVisibleResult(item: CardFeedResponse["items"][number], category: string): boolean {
  if (item.type === "company") {
    const companyName = (item.name ?? item.title ?? "") as string;
    if (!isValidCompanyName(companyName) || (item as any).isDemo) return false;
  }
  if (item.type === "resume" && (item as any).privacy === "draft") return false;
  if (item.type === "people" && (item as any).isDemo) return false;
  // Creators category: only People with isCreator=true. Defensive against
  // anything that isn't a person sneaking in from upstream.
  if (category === "creators") {
    if (item.type !== "people") return false;
    if (!(item as any).isCreator) return false;
  }
  return true;
}

/**
 * State + orchestration behind `<UnifiedSearch>`: URL-synced filters, the
 * card-feed (+ services/courses) fetch, client-side filtering/sorting,
 * pagination, and the per-result actions modal. The component is the pure
 * composition/render layer on top of this.
 */
export function useUnifiedSearch() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlQuery = searchParams.get("q") ?? "";
  const urlCategory = searchParams.get("category") ?? "all";
  const urlSortBy = searchParams.get("sortBy") ?? "";
  const urlHasMedia = searchParams.get("hasMedia") ?? "";

  const [viewMode, setViewMode] = useViewMode(
    "search.browse",
    "grid",
    BROWSE_VIEW_MODES,
  );
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    page: 1,
    limit: 20,
    experienceLevel: "all",
    datePosted: "all",
    sortBy: (urlSortBy as SearchFilters["sortBy"]) || "recent",
    search: urlQuery || undefined,
    hasMedia:
      urlHasMedia === "true" ? true : urlHasMedia === "false" ? false : undefined,
  });

  // Structured geo filter (gap #1139) — URL is the SSoT, fed by the global
  // header search's Advanced popover. UnifiedSearch reads here so its
  // card-feed fetch narrows to the chosen location; it no longer renders
  // its own picker (the header owns that surface, single entry point).
  const [geoFilter, setGeoFilter] = useState<LocationFilterValue>(() =>
    locationFilterFromQuery(searchParams),
  );
  React.useEffect(() => {
    setGeoFilter(locationFilterFromQuery(searchParams));
  }, [searchParams]);

  React.useEffect(() => {
    setSearchFilters((prev) => ({
      ...prev,
      search: urlQuery || undefined,
      sortBy: (urlSortBy as SearchFilters["sortBy"]) || "recent",
      hasMedia:
        urlHasMedia === "true"
          ? true
          : urlHasMedia === "false"
            ? false
            : undefined,
    }));
  }, [urlQuery, urlSortBy, urlHasMedia]);

  const selectedCategory = urlCategory;

  const [actionsModal, setActionsModal] = useState<{
    isOpen: boolean;
    item: any | null;
  }>({ isOpen: false, item: null });

  const [serviceItems, setServiceItems] = useState<ServiceMarketplaceItem[]>([]);
  const [courseItems, setCourseItems] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<CardFeedResponse | null>(
    null,
  );
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const lastRequestRef = React.useRef<string>("");

  const loadContent = async (
    category?: string,
    pageArg?: number,
    limitArg?: number,
  ) => {
    try {
      setIsLoadingContent(true);
      setContentError(null);

      const searchCategory = category || selectedCategory;
      const pageToUse = typeof pageArg === "number" ? pageArg : 1;
      const limitToUse = typeof limitArg === "number" ? limitArg : 12;
      // Single source of truth for "is the query active?" — sub-threshold
      // input ("", "A") normalises to "" here so the dedupe key, the
      // fetch payload, and the client-side filter below all agree.
      const effQuery = effectiveSearchQuery(searchFilters.search);

      const requestKey = JSON.stringify({
        c: searchCategory,
        p: pageToUse,
        l: limitToUse,
        s: searchFilters.sortBy || "recent",
        // Include effective search in the dedupe key so typing past the
        // threshold ("AI") re-fires the fetch, but earlier keystrokes ("A")
        // don't — they collapse to the empty-query key and reuse cache.
        q: effQuery,
      });
      if (lastRequestRef.current === requestKey) return;
      lastRequestRef.current = requestKey;

      const types = categoryToTypes(searchCategory);
      const limitPerType =
        types.length === 1
          ? limitToUse
          : Math.max(1, Math.ceil(limitToUse / Math.max(1, types.length)));

      const content = await fetchCardFeed({
        types,
        page: pageToUse,
        limitPerType,
        sort: (searchFilters.sortBy as any) || "recent",
        // Per-type fetchers that support query filtering read this. Today
        // fetchTemplates uses it to narrow the static template catalog;
        // other fetchers ignore it for now (#1613 follow-up tracks the
        // server-side unification of per-type query filtering).
        search: effQuery,
        geo: {
          countryId: geoFilter.countryId ?? undefined,
          stateId: geoFilter.stateId ?? undefined,
          cityId: geoFilter.cityId ?? undefined,
          radiusKm: geoFilter.radiusKm ?? undefined,
          remote: geoFilter.remote,
        },
      });
      setSearchResults(content);

      // Services + courses: only when their category (or "all") is selected.
      const wantServices = searchCategory === "services" || searchCategory === "all";
      setServiceItems(
        wantServices
          ? (await fetchOptionalList("/api/services/browse", limitToUse)).map(
              (s) => ({ ...s, type: "service" as const }),
            )
          : [],
      );
      const wantCourses = searchCategory === "courses" || searchCategory === "all";
      setCourseItems(
        wantCourses ? await fetchOptionalList("/api/courses/public", limitToUse) : [],
      );
    } catch (error) {
      console.error("Failed to load search content:", error);
      setContentError(t("errors.loadContentFailed"));
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleOpenActions = (item: any) =>
    setActionsModal({ isOpen: true, item });
  const handleCloseActions = () => setActionsModal({ isOpen: false, item: null });

  // Result → detail-page route, shared with the dashboard feed via the
  // feed-card-renderer module so the two can never drift.
  const entityHref = feedEntityHref;

  const handleView = (item: any) => {
    const href = entityHref(item);
    if (href) navigate(href);
  };

  const handleShare = (item: any) => console.log("Share item:", item.id);
  const handleEdit = (item: any) => console.log("Edit item:", item.id);
  const handleDownload = (item: any) => console.log("Download item:", item.id);
  const handleDelete = (item: any) => console.log("Delete item:", item.id);
  const handleTrack = (item: any) => console.log("Track candidate:", item.id);

  const contentItems = (searchResults
    ? searchResults.items.filter((item) => isVisibleResult(item, selectedCategory))
    : []) as any[];

  // Append service marketplace + course items when applicable
  const combinedItems = [...contentItems, ...(serviceItems as any[]), ...courseItems];

  // Heterogeneous type → card mapping lives in the shared
  // useFeedCardRenderer hook so /search and the dashboard feed can't drift.
  const renderResultCard = useFeedCardRenderer({
    onView: handleView,
    onActions: handleOpenActions,
  });

  const handleSearch = (query: string) => {
    const next = new URLSearchParams(searchParams);
    if (query) next.set("q", query);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  const handleFilterChange = (filters: SearchFilters) => {
    setSearchFilters(filters);
  };

  const handleClearFilters = () => {
    setSearchFilters({
      page: 1,
      limit: 20,
      experienceLevel: "all",
      datePosted: "all",
      sortBy: "recent",
    });
    const next = new URLSearchParams(searchParams);
    next.delete("q");
    next.delete("category");
    setSearchParams(next, { replace: true });
  };

  const handleCategoryChange = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id === "all") next.delete("category");
    else next.set("category", id);
    setSearchParams(next, { replace: true });
  };

  // Same gate the fetcher uses — keeps "is this query active?" decided
  // in one place (effectiveSearchQuery). Without this, a 1-char URL
  // could ignore the fetcher's gate (which would return the unfiltered
  // feed) while the client-side filter below silently re-narrowed to a
  // noisy match set.
  const clientSearchNeedle = effectiveSearchQuery(searchFilters.search);

  const filteredItems = combinedItems
    .filter((item) => matchesSearchFilters(item, clientSearchNeedle, searchFilters.hasMedia))
    .sort((a, b) => compareSearchResults(a, b, searchFilters.sortBy || "recent"));

  // Mirror the fetcher's gate — sub-threshold queries don't flip
  // pagination/count math into the client-side narrowing branch.
  const hasClientSideFiltering =
    clientSearchNeedle !== "" || searchFilters.hasMedia !== undefined;

  const {
    currentPage,
    itemsPerPage,
    startIndex,
    endIndex,
    setCurrentPage,
    handleItemsPerPageChange,
    handleTotalItemsChange,
  } = usePagination(
    hasClientSideFiltering ? filteredItems.length : searchResults?.total || 0,
    24,
  );

  React.useEffect(() => {
    const totalItems = hasClientSideFiltering
      ? filteredItems.length
      : searchResults?.total || 0;
    handleTotalItemsChange(totalItems);
  }, [
    filteredItems.length,
    searchResults?.total,
    hasClientSideFiltering,
    handleTotalItemsChange,
  ]);

  const paginatedItems = hasClientSideFiltering
    ? filteredItems.slice(startIndex, endIndex)
    : filteredItems;

  // Always run the fetch — `search` is plumbed down to the per-type
  // fetchers (card-feed.ts) so static catalogues (articles, guides,
  // tools, faqs, templates) filter their in-memory entries by the query
  // BEFORE pagination. Without this, a fresh load of `/?q=research` was
  // gated to zero items (the previous `!hasClientSideFiltering` guard
  // skipped the fetch entirely when a URL search was present), and a
  // typed-in search never reached beyond the few items the recency
  // sort happened to leave on page 1. `hasClientSideFiltering` still
  // governs pagination + count semantics below.
  React.useEffect(() => {
    loadContent(selectedCategory, currentPage, itemsPerPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, currentPage, itemsPerPage, searchFilters.sortBy, searchFilters.search, geoFilter]);

  const totalFound = hasClientSideFiltering
    ? filteredItems.length
    : searchResults?.total || 0;

  const retry = () => loadContent(selectedCategory, currentPage, itemsPerPage);

  const item = actionsModal.item;
  const actionsModalProps: ActionsModalProps = {
    isOpen: actionsModal.isOpen,
    onClose: handleCloseActions,
    item,
    user: user
      ? {
          ...user,
          role:
            user.role === USER_ROLES.EMPLOYER
              ? USER_ROLES.RECRUITER
              : user.role || USER_ROLES.JOB_SEEKER,
        }
      : null,
    onView: () => item && handleView(item),
    onShare: () => item && handleShare(item),
    onEdit: () => item && handleEdit(item),
    onDownload: () => item && handleDownload(item),
    onDelete: () => item && handleDelete(item),
    onTrack: () => item && handleTrack(item),
    onPromoteToMaster: async () => {
      const id = item?.id;
      if (!id) return;
      try {
        const isVariant = Boolean(item?.parentId);
        if (isVariant) {
          await resumeService.promoteVariantToMaster(id);
        } else {
          await resumeService.setMasterResume(id);
        }
      } catch (err) {
        console.error("Promote/Convert to master failed", err);
      }
    },
  };

  return {
    // Search bar + category bar
    searchFilters,
    selectedCategory,
    viewMode,
    setViewMode,
    handleSearch,
    handleFilterChange,
    handleClearFilters,
    handleCategoryChange,
    // Results
    clientSearchNeedle,
    totalFound,
    contentError,
    isLoadingContent,
    filteredItems,
    paginatedItems,
    renderResultCard,
    entityHref,
    handleView,
    retry,
    // Pagination
    currentPage,
    itemsPerPage,
    startIndex,
    endIndex,
    setCurrentPage,
    handleItemsPerPageChange,
    // Actions modal
    actionsModalProps,
  };
}
