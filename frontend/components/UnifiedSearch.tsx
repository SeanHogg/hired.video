import {
  Search,
  TrendingUp,
  User,
  Briefcase,
  Building2,
  Eye,
  Play,
  Sparkles,
  Mic,
  Grid,
  List,
  Newspaper,
  BookOpen,
  Wrench,
  HelpCircle,
  ShoppingBag,
  Star,
  GraduationCap,
} from "lucide-react";
import { useState } from "react";
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ActionsModal from "@/components/ActionsModal";
import SearchBar from "@/components/SearchBar";
import VoiceMarketplaceCard from "@/components/VoiceMarketplaceCard";
import ServiceMarketplaceCard, { type ServiceMarketplaceItem } from "@/components/ServiceMarketplaceCard";
import CourseMarketplaceCard, { type CourseMarketplaceItem } from "@/components/CourseMarketplaceCard";
import { apiClient } from "@/lib/api-client";
import TemplateCard from "@/components/resume-renderer/TemplateCard";
import ContentCard from "@/components/search/ContentCard";
import Pagination, { usePagination } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { useCardRenderer } from "@/lib/card-factory";
import { createUserContext, getDefaultUserContext } from "@/lib/user-context";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { companyService } from "@/lib/services/company-service";
import { useHeaderFilters } from "@/lib/header-filters";
import { type SearchFilters } from "@/lib/services/search-service";
import {
  fetchCardFeed,
  type CardFeedResponse,
  type CardFeedType,
} from "@/lib/card-feed";
import { resumeService } from "@/lib/services/resume-service";
import { cn } from "@/lib/utils";
import { isValidCompanyName } from "@/lib/utils/company-validation";

interface UnifiedSearchProps {
  /** Hide the inline search text input (header provides one). */
  hideSearchInput?: boolean;
  /**
   * Stick the search + category chips bar to the top of the viewport
   * (just under the fixed Navigation header) while the user scrolls.
   */
  stickySearch?: boolean;
}

const CATEGORIES = [
  { id: "all", label: "All", icon: TrendingUp },
  { id: "people", label: "People", icon: User },
  { id: "creators", label: "Creators", icon: Star },
  { id: "services", label: "Services", icon: ShoppingBag },
  { id: "courses", label: "Courses", icon: GraduationCap },
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "resumes", label: "Resumes", icon: User },
  { id: "jobs", label: "Jobs", icon: Briefcase },
  { id: "templates", label: "Templates", icon: Sparkles },
  { id: "media", label: "Media", icon: Play },
  { id: "voices", label: "Voices", icon: Mic },
  { id: "articles", label: "Articles", icon: Newspaper },
  { id: "guides", label: "Guides", icon: BookOpen },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "faqs", label: "FAQs", icon: HelpCircle },
];

const categoryToTypes = (category: string): CardFeedType[] => {
  switch (category) {
    case "resumes":
      return ["resume"];
    case "jobs":
      return ["job"];
    case "companies":
      return ["company"];
    case "people":
      return ["people"];
    case "creators":
      // Creators are a filter on People — same fetch, viewer-side filter on isCreator
      return ["people"];
    case "services":
      // Services have a dedicated fetch path handled below; no card-feed type
      return [];
    case "courses":
      // Courses also bypass the card-feed pipeline (separate /api/courses/public)
      return [];
    case "templates":
      return ["template"];
    case "articles":
      return ["article"];
    case "guides":
      return ["guide"];
    case "tools":
      return ["tool"];
    case "faqs":
      return ["faq"];
    case "media":
      return ["video"];
    case "all":
      return [
        "resume",
        "job",
        "company",
        "people",
        "video",
        "template",
        "article",
        "guide",
        "tool",
        "faq",
      ];
    default:
      return [];
  }
};

export default function UnifiedSearch({
  hideSearchInput = false,
  stickySearch = false,
}: UnifiedSearchProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlQuery = searchParams.get("q") ?? "";
  const urlCategory = searchParams.get("category") ?? "all";
  const urlSortBy = searchParams.get("sortBy") ?? "";
  const urlHasMedia = searchParams.get("hasMedia") ?? "";

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
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

  // When the header provides the search UI (on /search), register our advanced
  // filters so they render inside HeaderSearch's Advanced popover instead of a
  // duplicate panel on the page.
  useHeaderFilters(
    hideSearchInput
      ? [
          {
            key: "sortBy",
            label: "Sort by",
            type: "select",
            options: [
              { value: "recent", label: "Recent" },
              { value: "featured", label: "Featured" },
              { value: "top", label: "Top" },
              { value: "latest", label: "Latest" },
            ],
          },
          { key: "hasMedia", label: "Has media", type: "boolean" },
        ]
      : [],
  );

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

      const requestKey = JSON.stringify({
        c: searchCategory,
        p: pageToUse,
        l: limitToUse,
        s: searchFilters.sortBy || "recent",
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
      });
      setSearchResults(content);

      // Services + courses live outside the card-feed pipeline. Fetch them
      // in parallel when their category (or "all") is selected. Both pass
      // `suppressErrorEvent` so a missing migration / unavailable endpoint
      // doesn't fire the global support-ticket toast — search just falls
      // back to an empty list for that category.
      if (searchCategory === "services" || searchCategory === "all") {
        try {
          const res = await apiClient.get<any[]>(
            `/api/services/browse?limit=${limitToUse}`,
            undefined,
            { suppressErrorEvent: true },
          );
          const list = res.data ?? [];
          setServiceItems(list.map((s) => ({ ...s, type: "service" as const })));
        } catch {
          setServiceItems([]);
        }
      } else {
        setServiceItems([]);
      }

      if (searchCategory === "courses" || searchCategory === "all") {
        try {
          const res = await apiClient.get<any[]>(
            `/api/courses/public?limit=${limitToUse}`,
            undefined,
            { suppressErrorEvent: true },
          );
          const list = res.data ?? [];
          setCourseItems(list);
        } catch {
          setCourseItems([]);
        }
      } else {
        setCourseItems([]);
      }
    } catch (error) {
      console.error("Failed to load search content:", error);
      setContentError("Failed to load content");
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleOpenActions = (item: any) =>
    setActionsModal({ isOpen: true, item });
  const handleCloseActions = () => setActionsModal({ isOpen: false, item: null });

  const handleView = (item: any) => {
    if (item.type === "resume") navigate(`/resumes/${item.id}`);
    else if (item.type === "job") navigate(`/jobs/${item.id}`);
    else if (item.type === "company") navigate(`/companies/${item.id}`);
    else if (item.type === "people")
      navigate(`/people/${item.slug || item.id}`);
    else if (item.type === "video") navigate(`/v/${item.id}`);
    else if (item.href) navigate(item.href);
  };

  const handleShare = (item: any) => console.log("Share item:", item.id);
  const handleEdit = (item: any) => console.log("Edit item:", item.id);
  const handleDownload = (item: any) => console.log("Download item:", item.id);
  const handleDelete = (item: any) => console.log("Delete item:", item.id);
  const handleTrack = (item: any) => console.log("Track candidate:", item.id);

  const fetchCompanies = async () => {
    try {
      await loadContent();
    } catch (error) {
      console.error("Failed to refresh companies:", error);
    }
  };

  // Wire up follow/unfollow hooks for downstream cards that may call them.
  const _handleFollowCompany = async (companyId: string) => {
    if (!user) return;
    try {
      await companyService.followCompany(companyId);
      await fetchCompanies();
    } catch (error) {
      console.error("Failed to follow company:", error);
    }
  };
  const _handleUnfollowCompany = async (companyId: string) => {
    if (!user) return;
    try {
      await companyService.unfollowCompany(companyId);
      await fetchCompanies();
    } catch (error) {
      console.error("Failed to unfollow company:", error);
    }
  };
  void _handleFollowCompany;
  void _handleUnfollowCompany;

  const contentItems = (searchResults
    ? searchResults.items.filter((item) => {
        if (item.type === "company") {
          const companyName = (item.name ?? item.title ?? "") as string;
          if (!isValidCompanyName(companyName) || (item as any).isDemo) {
            return false;
          }
        }
        if (item.type === "resume" && (item as any).privacy === "draft") {
          return false;
        }
        if (item.type === "people" && (item as any).isDemo) {
          return false;
        }
        // Creators category: only People with isCreator=true. Defensive against
        // anything that isn't a person sneaking in from upstream.
        if (selectedCategory === "creators") {
          if (item.type !== "people") return false;
          if (!(item as any).isCreator) return false;
        }
        return true;
      })
    : []) as any[];

  // Append service marketplace + course items when applicable
  const combinedItems = [...contentItems, ...(serviceItems as any[]), ...courseItems];

  const userContext = user
    ? createUserContext({
        userId: user.id,
        role: user.role || "regular_user",
        accountId: (user as any).accountId,
        permissions: (user as any).permissions || [],
      })
    : getDefaultUserContext();

  const allSectionRenderer = useCardRenderer({
    section: "all",
    userContext,
    showOwnership: false,
    interactions: { onView: handleView, onActions: handleOpenActions },
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

  const filteredItems = combinedItems
    .filter((item) => {
      const q = searchFilters.search || "";
      const needle = q.toLowerCase();
      const matchesSearch =
        q === "" ||
        (item.title && item.title.toLowerCase().includes(needle)) ||
        (item.name && item.name.toLowerCase().includes(needle)) ||
        (item.profession &&
          item.profession.toLowerCase().includes(needle)) ||
        (item.company &&
          item.company.toLowerCase().includes(needle)) ||
        (item.summary && item.summary.toLowerCase().includes(needle)) ||
        ((item as any).description &&
          (item as any).description.toLowerCase().includes(needle)) ||
        ((item as any).keywords &&
          (item as any).keywords.toLowerCase().includes(needle)) ||
        ((item as any).category &&
          (item as any).category.toLowerCase().includes(needle));

      const matchesMedia =
        searchFilters.hasMedia === undefined ||
        (searchFilters.hasMedia === true && (item as any).hasMedia === true) ||
        (searchFilters.hasMedia === false && (item as any).hasMedia !== true);

      return matchesSearch && matchesMedia;
    })
    .sort((a, b) => {
      const sortBy = searchFilters.sortBy || "recent";
      switch (sortBy) {
        case "recent": {
          const aDate = new Date(
            (a as any).createdAt || (a as any).postedDate || 0,
          );
          const bDate = new Date(
            (b as any).createdAt || (b as any).postedDate || 0,
          );
          return bDate.getTime() - aDate.getTime();
        }
        case "featured": {
          const aF = (a as any).isFeatured || false;
          const bF = (b as any).isFeatured || false;
          if (aF !== bF) return (bF ? 1 : 0) - (aF ? 1 : 0);
          return ((b as any).views || 0) - ((a as any).views || 0);
        }
        case "top":
          return ((b as any).views || 0) - ((a as any).views || 0);
        case "latest": {
          const aU = new Date(
            (a as any).updatedAt ||
              (a as any).createdAt ||
              (a as any).postedDate ||
              0,
          );
          const bU = new Date(
            (b as any).updatedAt ||
              (b as any).createdAt ||
              (b as any).postedDate ||
              0,
          );
          return bU.getTime() - aU.getTime();
        }
        default:
          return 0;
      }
    });

  const hasClientSideFiltering =
    (searchFilters.search && searchFilters.search.length > 0) ||
    searchFilters.hasMedia !== undefined;

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

  React.useEffect(() => {
    if (!hasClientSideFiltering) {
      loadContent(selectedCategory, currentPage, itemsPerPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, currentPage, itemsPerPage, hasClientSideFiltering, searchFilters.sortBy]);

  const totalFound = hasClientSideFiltering
    ? filteredItems.length
    : searchResults?.total || 0;

  return (
    <>
      {/* Search + filters control */}
      <section
        className={cn(
          "py-4 sm:py-6 px-4 sm:px-6 lg:px-8 border-b border-border bg-background/95 backdrop-blur-md",
          stickySearch && "sticky top-16 z-40",
        )}
      >
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-3 sm:gap-4">
            {!hideSearchInput && (
              <SearchBar
                context="all"
                value={searchFilters.search}
                filters={searchFilters}
                onSearch={handleSearch}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
              />
            )}

            {/* Category chips row. When the header owns the search + advanced
             * filters, the grid/list toggle lives at the far right of this row. */}
            <div className="flex items-center gap-2">
              <div className="flex gap-2 flex-1 justify-start overflow-x-auto pb-2 sm:pb-0 sm:flex-wrap">
                {CATEGORIES.map((category) => (
                  <Button
                    key={category.id}
                    variant={
                      selectedCategory === category.id ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => handleCategoryChange(category.id)}
                    className="gap-2 flex-shrink-0 min-h-[44px]"
                  >
                    <category.icon className="w-4 h-4" />
                    {category.label}
                  </Button>
                ))}
              </div>

              {hideSearchInput && (
                <div className="flex rounded-md border flex-shrink-0 ml-2">
                  <Button
                    variant={viewMode === "grid" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("grid")}
                    className="rounded-r-none min-h-[44px]"
                    aria-label="Grid view"
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("list")}
                    className="rounded-l-none min-h-[44px]"
                    aria-label="List view"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="pt-8 pb-6 sm:pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-4 sm:mb-6">
            <p className="text-xs sm:text-sm text-muted-foreground">
              {totalFound} items found
              {searchFilters.search && ` for "${searchFilters.search}"`}
              {totalFound > itemsPerPage &&
                ` (showing ${startIndex + 1}-${Math.min(endIndex, totalFound)})`}
            </p>
          </div>

          {contentError ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{contentError}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() =>
                  loadContent(selectedCategory, currentPage, itemsPerPage)
                }
              >
                Retry
              </Button>
            </div>
          ) : isLoadingContent && filteredItems.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-40 bg-muted animate-pulse rounded-lg"
                />
              ))}
            </div>
          ) : filteredItems.length > 0 ? (
            <>
              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {paginatedItems.map((item, index) => {
                    if ((item as any).type === "voice") {
                      return (
                        <VoiceMarketplaceCard
                          key={item.id}
                          item={item as any}
                        />
                      );
                    }
                    if ((item as any).type === "service") {
                      return (
                        <ServiceMarketplaceCard
                          key={item.id}
                          item={item as ServiceMarketplaceItem}
                        />
                      );
                    }
                    if ((item as any).type === "course") {
                      return (
                        <CourseMarketplaceCard
                          key={item.id}
                          item={item as CourseMarketplaceItem}
                        />
                      );
                    }
                    if (
                      (item as any).type === "template" &&
                      (item as any).descriptor
                    ) {
                      return (
                        <TemplateCard
                          key={item.id}
                          descriptor={(item as any).descriptor}
                        />
                      );
                    }
                    if (
                      item.type === "article" ||
                      item.type === "guide" ||
                      item.type === "tool" ||
                      item.type === "faq"
                    ) {
                      return <ContentCard key={item.id} item={item as any} />;
                    }
                    return allSectionRenderer(item, index);
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  {paginatedItems.map((item) => (
                    <div
                      key={item.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors overflow-hidden"
                    >
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="flex-shrink-0">
                          {item.type === "people" && item.avatar && (
                            <img
                              src={item.avatar}
                              alt={item.name}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          )}
                          {item.type === "company" && (item as any).logo && (
                            <img
                              src={(item as any).logo}
                              alt={(item as any).name}
                              className="w-12 h-12 rounded-lg object-cover"
                            />
                          )}
                          {(item.type === "resume" || item.type === "job") && (
                            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                              {item.type === "resume" ? (
                                <User className="w-6 h-6 text-primary" />
                              ) : (
                                <Briefcase className="w-6 h-6 text-primary" />
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-lg truncate">
                                <button
                                  onClick={() => handleView(item)}
                                  className="block w-full text-left truncate hover:text-primary transition-colors cursor-pointer"
                                >
                                  {item.name ?? item.title ?? ""}
                                </button>
                              </h3>
                              <p className="text-muted-foreground truncate">
                                {item.title}
                              </p>
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2 break-words">
                                {item.summary}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleView(item)}
                              className="min-h-[44px] flex-shrink-0"
                            >
                              View
                            </Button>
                          </div>
                          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                            {item.company && <span>{item.company}</span>}
                            {"location" in item && item.location && (
                              <span>{item.location}</span>
                            )}
                            {user &&
                              (item.userId === user.id ||
                                (item as any).isOwner === true) && (
                                <span className="flex items-center gap-1">
                                  <Eye className="w-3 h-3" />
                                  {item.views} views
                                </span>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Pagination
                currentPage={currentPage}
                totalItems={totalFound}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            </>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                No content found
              </h3>
              <p className="text-muted-foreground">
                Try adjusting your search or filters.
              </p>
            </div>
          )}
        </div>
      </section>

      <ActionsModal
        isOpen={actionsModal.isOpen}
        onClose={handleCloseActions}
        item={actionsModal.item}
        user={
          user
            ? {
                ...user,
                role:
                  user.role === USER_ROLES.EMPLOYER
                    ? USER_ROLES.RECRUITER
                    : user.role || USER_ROLES.JOB_SEEKER,
              }
            : null
        }
        onView={() => actionsModal.item && handleView(actionsModal.item)}
        onShare={() => actionsModal.item && handleShare(actionsModal.item)}
        onEdit={() => actionsModal.item && handleEdit(actionsModal.item)}
        onDownload={() =>
          actionsModal.item && handleDownload(actionsModal.item)
        }
        onDelete={() => actionsModal.item && handleDelete(actionsModal.item)}
        onTrack={() => actionsModal.item && handleTrack(actionsModal.item)}
        onPromoteToMaster={async () => {
          const id = actionsModal.item?.id;
          if (!id) return;
          try {
            const isVariant = Boolean(actionsModal.item?.parentId);
            if (isVariant) {
              await resumeService.promoteVariantToMaster(id);
            } else {
              await resumeService.setMasterResume(id);
            }
          } catch (err) {
            console.error("Promote/Convert to master failed", err);
          }
        }}
      />
    </>
  );
}
