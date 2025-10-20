import {
  Search,
  TrendingUp,
  User,
  Briefcase,
  Building2,
  Grid,
  List,
  Eye,
  Play,
} from "lucide-react";
import { useState } from "react";
import * as React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSEO } from "@/lib/seo";
import ActionsModal from "@/components/ActionsModal";
import Footer from "@/components/Footer";
import HeroCarousel from "@/components/HeroCarousel";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import VideoCard from "@/components/VideoCard";
import MediaCard from "@/components/MediaCard";
import PeopleCard from "@/components/PeopleCard";
import SearchBar from "@/components/SearchBar";

import Pagination, { usePagination } from "@/components/Pagination";
import ContentSection from "@/components/ui/ContentSection";
import { useCardRenderer } from "@/lib/card-factory";
import { createUserContext, getDefaultUserContext } from "@/lib/user-context";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { companyService } from "@/lib/services/company-service";
import {
  dashboardService,
  type DashboardStats,
  type HomepageContent,
} from "@/lib/services/dashboard-service";
import {
  searchService,
  type SearchResponse,
  type SearchFilters,
} from "@/lib/services/search-service";
import { jobService } from "@/lib/services/job-service";
import { userService } from "@/lib/services/user-service";
import { resumeService } from "@/lib/services/resume-service";
import type { CompanyWithOwnership } from "@/types/company";
import { isValidCompanyName } from "@/lib/utils/company-validation";

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();

  // SEO for homepage
  useSEO(location.pathname);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    page: 1,
    limit: 20,
    experienceLevel: "all",
    datePosted: "all",
    sortBy: "recent",
  });
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  // Company-specific state for interactive features
  // Legacy company state removed; unified search provides companies

  // Actions modal state
  const [actionsModal, setActionsModal] = useState<{
    isOpen: boolean;
    item: any | null;
  }>({
    isOpen: false,
    item: null,
  });

  // New state for real API data - now with individual loading states
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(
    null,
  );

  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  // Load dashboard data function
  const loadContent = async (category?: string, pageArg?: number, limitArg?: number) => {
    try {
      setIsLoadingContent(true);
      setContentError(null);

      // Call unified search to get content for the selected category
      const searchCategory = category || selectedCategory;
      const pageToUse = typeof pageArg === "number" ? pageArg : 1;
      const limitToUse = typeof limitArg === "number" ? limitArg : 12;
      const content = await searchService.searchPublicContent({
        page: pageToUse,
        limit: limitToUse,
        category: searchCategory === "all" ? undefined : (searchCategory as any),
      });

      setSearchResults(content);
    } catch (error) {
      console.error("Failed to load homepage content:", error);
      setContentError("Failed to load content");
    } finally {
      setIsLoadingContent(false);
    }
  };

  // Note: loadContent is called by the useEffect at line ~563 when dependencies change
  // No need for a separate mount effect - the dependency effect handles initial load



  // Action handlers
  const handleOpenActions = (item: any) => {
    setActionsModal({ isOpen: true, item });
  };

  const handleCloseActions = () => {
    setActionsModal({ isOpen: false, item: null });
  };

  const handleView = (item: any) => {
    if (item.type === "resume") {
      navigate(`/resumes/${item.id}`);
    } else if (item.type === "job") {
      navigate(`/jobs/${item.id}`);
    } else if (item.type === "company") {
      navigate(`/companies/${item.id}`);
    } else if (item.type === "people") {
      navigate(`/people/${(item).slug || item.id}`);
    } else {
      console.log("Unknown item type:", item.type, "for item:", item.id);
    }
  };

  const handleShare = (item: any) => {
    console.log("Share item:", item.id);
  };

  const handleEdit = (item: any) => {
    console.log("Edit item:", item.id);
  };

  const handleDownload = (item: any) => {
    console.log("Download item:", item.id);
  };

  const handleDelete = (item: any) => {
    console.log("Delete item:", item.id);
  };

  const handleTrack = (item: any) => {
    console.log("Track candidate:", item.id);
  };

  // Interactive company functions
  const fetchCompanies = async () => {
    try {
      await loadContent(); // Refresh all content including companies
    } catch (error) {
      console.error("Failed to refresh companies:", error);
    }
  };

  const handleFollowCompany = async (companyId: string) => {
    if (user) {
      try {
        await companyService.followCompany(companyId);
        await fetchCompanies(); // Refresh companies
      } catch (error) {
        console.error("Failed to follow company:", error);
      }
    }
  };

  const handleUnfollowCompany = async (companyId: string) => {
    if (user) {
      try {
        await companyService.unfollowCompany(companyId);
        await fetchCompanies(); // Refresh companies
      } catch (error) {
        console.error("Failed to unfollow company:", error);
      }
    }
  };

  const handleTrackCompany = async (companyId: string) => {
    console.log("Track company:", companyId);
    // This could be implemented to track companies for non-follow scenarios
  };

  const handleUntrackCompany = async (companyId: string) => {
    console.log("Untrack company:", companyId);
    // This could be implemented to untrack companies
  };

  // Get companies based on user role and authentication
  const getCompaniesForUser = () => {
    if (!user || !searchResults) {
      return { owned: [], tracked: [] };
    }
    // TODO: Implement real company ownership logic with API
    return { owned: [], tracked: [] };
  };

  // Convert unified search results to content items
  const contentItems = searchResults
    ? searchResults.items
      .map((item) => {
        switch (item.type) {
          case "people":
            // Filter out demo users from public results
            if ((item as any).isDemo) {
              return null;
            }

            return {
              id: item.id,
              name: item.name ?? item.title ?? "",
              title: item.headline || item.summary || "Professional",
              summary: item.headline || item.summary || "Professional",
              avatar: item.avatar,
              views: item.views || 0,
              type: "people" as const,
              contentType: "profile" as const,
              profession:
                item.headline?.split(" | ")[0] ||
                item.summary ||
                "Professional",
              company: "Independent", // TODO: Get from user profile
              createdAt: item.createdAt || new Date().toISOString(),
              location: item.location,
              role: "job_seeker" as const, // TODO: Get actual role
              isVerified: false, // TODO: Get from user profile
              isPremium: false, // TODO: Get from user profile
            };
          case "company":
            // Filter out companies with invalid names and demo companies
            const companyName = item.name ?? item.title ?? "";

            if (!isValidCompanyName(companyName) || (item as any).isDemo) {
              return null; // Filter out invalid or demo companies
            }

            return {
              id: item.id,
              name: companyName,
              title: item.description || item.summary || "Company",
              summary: item.description || item.summary || "Company",
              logo: item.logo,
              views: item.views || 0,
              type: "company" as const,
              contentType: "profile" as const,
              profession: item.industry || "Technology",
              company: companyName,
              createdAt: item.createdAt || new Date().toISOString(),
              location: item.location,
              industry: item.industry, // Use actual industry from API
              size: item.size, // Use actual size from API
              founded: item.founded, // Use actual founded year from API
              activeJobCount: item.activeJobCount || 0,
              followers: item.followers || 0,
            };
          case "resume":
            // Filter out DRAFT resumes - they should not be visible
            if ((item as any).privacy === "draft") {
              return null;
            }
            return {
              id: item.id,
              name: item.title || item.name || "Untitled Resume",
              title: item.title || item.name || "Untitled Resume",
              summary:
                item.summary || item.description || "No summary available",
              views: item.views || 0,
              type: "resume" as const,
              contentType: "text" as const,
              profession: item.skills?.[0] || "Professional",
              company: "Independent", // TODO: Get from resume data
              createdAt: item.createdAt || new Date().toISOString(),
              ownerId: item.id, // TODO: Get actual owner ID
              privacy: (item as any).privacy || "public",
            };
          case "job":
            return {
              id: item.id,
              title: item.title,
              name: item.title,
              summary: `${item.title} at ${item.company || "Unknown Company"}`,
              views: item.views || 0,
              applications: (item as any).applications || 0,
              type: "job" as const,
              contentType: "job" as const,
              profession: item.title,
              company: item.company || "Unknown Company",
              createdAt:
                item.postedDate || item.createdAt || new Date().toISOString(),
              location: item.location,
              employmentType: item.employmentType || "Full-time",
              salaryMin: 0, // TODO: Get from job data
              salaryMax: 0, // TODO: Get from job data
              jobData: {
                id: item.id,
                title: item.title,
                company: item.company || "Unknown Company",
                location: item.location || "Unknown Location",
                employmentType: item.employmentType || "Full-time",
                postedDate:
                  item.postedDate ||
                  item.createdAt ||
                  new Date().toISOString(),
                views: item.views || 0,
              },
            };
          case "media":
            // Handle media content (videos, images from resumes)
            const metaType = Array.isArray(item.skills) ? item.skills[0] : item.skills; // MetaType stored in skills field
            const userId = item.location; // UserId stored in location field
            const resumeId = item.company; // ReferenceId stored in company field
            const mediaUrl = item.experienceLevel; // URL stored in experience level field

            return {
              id: item.id,
              name: item.name || "Media Content",
              title: item.name || "Media Content",
              summary: item.summary || item.description || "Media from resume",
              views: item.views || 0,
              type: "media" as const,
              contentType: metaType?.toLowerCase?.().includes("video") ? "video" : "image" as const,
              profession: "Content Creator", // Generic profession for media
              company: "MyVideoResume", // Platform name
              createdAt: item.createdAt || new Date().toISOString(),
              // Media-specific properties
              mediaType: metaType,
              mediaUrl: mediaUrl,
              thumbnail: item.avatar, // Thumbnail stored in avatar field
              ownerId: userId,
              resumeId: resumeId,
              isFeatured: item.isFeatured || false,
            };
          default:
            return null;
        }
      })
      .filter(Boolean)
    : [];

  // Create user context for dynamic actions
  const userContext = user
    ? createUserContext({
      userId: user.id,
      role: user.role || "regular_user",
      accountId: (user as any).accountId,
      permissions: (user as any).permissions || [],
    })
    : getDefaultUserContext();

  // Create card renderers for different sections with user context
  const featuredSectionRenderer = useCardRenderer({
    section: "featured",
    userContext,
    showOwnership: false,
    interactions: {
      onView: handleView,
      onActions: handleOpenActions,
    },
  });

  // Create card renderer for the "all" section (used in grid view)
  const allSectionRenderer = useCardRenderer({
    section: "all",
    userContext,
    showOwnership: false,
    interactions: {
      onView: handleView,
      onActions: handleOpenActions,
    },
  });

  const recentSectionRenderer = useCardRenderer({
    section: "recent",
    userContext,
    showOwnership: false,
    interactions: {
      onView: handleView,
      onActions: handleOpenActions,
    },
  });

  const latestSectionRenderer = useCardRenderer({
    section: "latest",
    userContext,
    showOwnership: false,
    interactions: {
      onView: handleView,
      onActions: handleOpenActions,
    },
  });

  const topSectionRenderer = useCardRenderer({
    section: "top",
    userContext,
    showOwnership: false,
    interactions: {
      onView: handleView,
      onActions: handleOpenActions,
    },
  });

  // Fetch companies when filters change or when companies category is selected
  // Removed legacy companies fetch effect

  const categories = [
    { id: "all", label: "All", icon: TrendingUp },
    { id: "people", label: "People", icon: User },
    { id: "companies", label: "Companies", icon: Building2 },
    { id: "resumes", label: "Resumes", icon: User },
    { id: "jobs", label: "Jobs", icon: Briefcase },
    { id: "media", label: "Media", icon: Play },
  ];

  const allContentItems = contentItems;

  const handleSearch = (query: string) => {
    setSearchFilters((prev) => ({ ...prev, search: query }));
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
  };

  const filteredItems = allContentItems
    .filter((item) => {
      const searchQuery = searchFilters.search || "";

      // Only apply client-side search filtering if there's a search query
      // Category filtering is already handled by the backend API
      const matchesSearch =
        searchQuery === "" ||
        (item.title &&
          item.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.name &&
          item.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.profession &&
          item.profession.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.company &&
          item.company.toLowerCase().includes(searchQuery.toLowerCase()));

      // Media filter logic (for additional UI filters)
      const matchesMedia =
        searchFilters.hasMedia === undefined ||
        (searchFilters.hasMedia === true && (item as any).hasMedia === true) ||
        (searchFilters.hasMedia === false && (item as any).hasMedia !== true);

      return matchesSearch && matchesMedia;
    })
    .sort((a, b) => {
      const sortBy = searchFilters.sortBy || "recent";

      switch (sortBy) {
        case "recent":
          // Sort by creation date (newest first)
          const aDate = new Date(
            (a as any).createdAt || (a as any).postedDate || 0,
          );
          const bDate = new Date(
            (b as any).createdAt || (b as any).postedDate || 0,
          );
          return bDate.getTime() - aDate.getTime();

        case "featured":
          // Sort by featured status first, then by views
          const aFeatured = (a as any).isFeatured || false;
          const bFeatured = (b as any).isFeatured || false;
          if (aFeatured !== bFeatured) {
            return (bFeatured ? 1 : 0) - (aFeatured ? 1 : 0);
          }
          return ((b as any).views || 0) - ((a as any).views || 0);

        case "top":
          // Sort by views/popularity (highest first)
          return ((b as any).views || 0) - ((a as any).views || 0);

        case "latest":
          // Sort by latest activity/updates (newest first)
          const aUpdate = new Date(
            (a as any).updatedAt ||
            (a as any).createdAt ||
            (a as any).postedDate ||
            0,
          );
          const bUpdate = new Date(
            (b as any).updatedAt ||
            (b as any).createdAt ||
            (b as any).postedDate ||
            0,
          );
          return bUpdate.getTime() - aUpdate.getTime();

        default:
          return 0;
      }
    });

  // Pagination logic - use backend pagination when no additional client-side filtering is applied
  const hasClientSideFiltering = (searchFilters.search && searchFilters.search.length > 0) ||
                                  searchFilters.hasMedia !== undefined;

  const {
    currentPage,
    itemsPerPage,
    totalPages,
    startIndex,
    endIndex,
    setCurrentPage,
    handleItemsPerPageChange,
    handleTotalItemsChange,
  } = usePagination(
    hasClientSideFiltering ? filteredItems.length : (searchResults?.total || 0),
    12
  );

  // Update pagination when filtered items change
  React.useEffect(() => {
    const totalItems = hasClientSideFiltering ? filteredItems.length : (searchResults?.total || 0);
    handleTotalItemsChange(totalItems);
  }, [filteredItems.length, searchResults?.total, hasClientSideFiltering, handleTotalItemsChange]);

  // Get paginated items - use all items if backend already paginated, otherwise slice client-side
  const paginatedItems = hasClientSideFiltering
    ? filteredItems.slice(startIndex, endIndex)
    : filteredItems; // Backend already paginated these

  // Refetch when page or page size changes (server-side pagination) and no client-side filtering is applied
  React.useEffect(() => {
    if (!hasClientSideFiltering) {
      loadContent(selectedCategory, currentPage, itemsPerPage);
    }
  }, [selectedCategory, currentPage, itemsPerPage, hasClientSideFiltering]);

  // Calculate total views from search results
  const totalViews = searchResults
    ? searchResults.items.reduce((sum, item) => sum + (item.views || 0), 0)
    : 0;
  const formatTotalViews = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  // Helper function to render skeleton loaders
  const renderSkeletonLoader = (count: number, className = "h-32") => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${className} bg-muted animate-pulse rounded-lg`}
        />
      ))}
    </div>
  );

  // Helper function to render error state for a section
  const renderSectionError = (message: string) => (
    <div className="text-center py-8">
      <p className="text-muted-foreground">{message}</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => window.location.reload()}
      >
        Retry
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        {/* Page H1 for semantic SEO */}
        <h1 className="sr-only">MyVideoResume — Discover Jobs, Companies, People, and Resumes</h1>

        {/* Hero Carousel */}
        <HeroCarousel
          totalViews={formatTotalViews(totalViews)}
          totalItems={contentItems.length}
        />

        {/* Search and Filters */}
        <section className="py-4 sm:py-6 px-4 sm:px-6 lg:px-8 border-b border-border bg-background/80 backdrop-blur-md sticky top-16 z-40">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col gap-3 sm:gap-4">
              {/* Search Bar */}
              <SearchBar
                context="all"
                value={searchFilters.search}
                filters={searchFilters}
                onSearch={handleSearch}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
              />

              {/* Category Filters */}
              <div className="flex gap-2 justify-start overflow-x-auto pb-2 sm:pb-0 sm:justify-center md:justify-start sm:flex-wrap">
                {categories.map((category) => (
                  <Button
                    key={category.id}
                    variant={
                      selectedCategory === category.id ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setSelectedCategory(category.id)}
                    className="gap-2 flex-shrink-0 min-h-[44px]"
                  >
                    <category.icon className="w-4 h-4" />
                    {category.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Content Grid */}
        <section className="pt-16 pb-6 sm:pb-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            {/* Results Header */}
            <div className="mb-4 sm:mb-6">
              <div className="flex flex-col gap-0 sm:gap-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                    {searchFilters.sortBy === "recent" && "Recent "}
                    {searchFilters.sortBy === "featured" && "Featured "}
                    {searchFilters.sortBy === "top" && "Top "}
                    {searchFilters.sortBy === "latest" && "Latest "}
                    {selectedCategory === "all"
                      ? "Content"
                      : selectedCategory === "people"
                        ? "People"
                        : selectedCategory === "companies"
                          ? "Companies"
                          : selectedCategory === "resumes"
                            ? "Resumes"
                            : selectedCategory === "media"
                              ? "Media"
                              : selectedCategory === "jobs"
                                ? "Jobs"
                                : "Content"}
                  </h2>

                  {/* View Toggle - Inline with heading */}
                  <div className="flex rounded-md border">
                    <Button
                      variant={viewMode === "grid" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("grid")}
                      className="rounded-r-none min-h-[44px]"
                    >
                      <Grid className="h-4 w-4" />
                      <span className="ml-2 sm:hidden">Grid</span>
                    </Button>
                    <Button
                      variant={viewMode === "list" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("list")}
                      className="rounded-l-none min-h-[44px]"
                    >
                      <List className="h-4 w-4" />
                      <span className="ml-2 sm:hidden">List</span>
                    </Button>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-muted-foreground">
                  {hasClientSideFiltering ? filteredItems.length : (searchResults?.total || 0)} items found
                  {searchFilters.search && ` for "${searchFilters.search}"`}
                  {(hasClientSideFiltering ? filteredItems.length : (searchResults?.total || 0)) > itemsPerPage &&
                    ` (showing ${startIndex + 1}-${Math.min(endIndex, hasClientSideFiltering ? filteredItems.length : (searchResults?.total || 0))})`}
                </p>
              </div>
            </div>

            {/* Content Grid/List */}
            {filteredItems.length > 0 ? (
              <>
                {viewMode === "grid" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                    {paginatedItems.map((item, index) => {
                      // Use the pre-created card renderer (it's a function, not an object)
                      return allSectionRenderer(item, index);
                    })}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {paginatedItems.map((item) => (
                      <div
                        key={item.id}
                        className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start gap-4">
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
                            {(item.type === "resume" ||
                              item.type === "job") && (
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
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-semibold text-lg truncate">
                                  <button
                                    onClick={() => {
                                      if (item.type === "people")
                                        navigate(`/people/${(item as any).slug || item.id}`);
                                      else if (item.type === "company")
                                        navigate(`/companies/${item.id}`);
                                      else if (item.type === "resume")
                                        navigate(`/resumes/${item.id}`);
                                      else if (item.type === "job")
                                        navigate(`/jobs/${item.id}`);
                                      else if (item.type === "media") {
                                        // For media items, navigate to the associated resume with the media reference
                                        const resumeId = (item as any).resumeId;
                                        const referenceId = item.id;
                                        if (resumeId) {
                                          navigate(`/resumes/${resumeId}#${referenceId}`);
                                        } else {
                                          // Fallback to media owner's profile
                                          const ownerId = (item as any).ownerId;
                                          const ownerSlug = (item as any).ownerSlug;
                                          if (ownerId) {
                                            navigate(`/people/${ownerSlug || ownerId}`);
                                          }
                                        }
                                      }
                                    }}
                                    className="text-left hover:text-primary transition-colors cursor-pointer"
                                  >
                                    {item.name ?? item.title ?? ""}
                                  </button>
                                </h3>
                                <p className="text-muted-foreground">
                                  {item.title}
                                </p>
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {item.summary}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (item.type === "people")
                                    navigate(`/people/${(item as any).slug || item.id}`);
                                  else if (item.type === "company")
                                    navigate(
                                      `/companies/${(item as any).id}`,
                                    );
                                  else if (item.type === "resume")
                                    navigate(`/resumes/${item.id}`);
                                  else if (item.type === "job")
                                    navigate(`/jobs/${(item as any).id}`);
                                }}
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
                              <span className="flex items-center gap-1">
                                <Eye className="w-3 h-3" />
                                {item.views} views
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                <Pagination
                  currentPage={currentPage}
                  totalItems={hasClientSideFiltering ? filteredItems.length : (searchResults?.total || 0)}
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
                  Try adjusting your search or filters to find more resumes and
                  videos.
                </p>
              </div>
            )}
          </div>
        </section>



        <Footer />
      </div>

      {/* Actions Modal */}
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
        onDownload={() => actionsModal.item && handleDownload(actionsModal.item)}
        onDelete={() => actionsModal.item && handleDelete(actionsModal.item)}
        onTrack={() => actionsModal.item && handleTrack(actionsModal.item)}
        onPromoteToMaster={async () => {
          const id = actionsModal.item?.id;
          if (!id) return;
          try {
            // If it's a variant, call promote endpoint; if it's an orphan (no parentId), set as master
            const isVariant = Boolean((actionsModal.item)?.parentId);
            if (isVariant) {
              const ok = await resumeService.promoteVariantToMaster(id);
              if (ok) {
                // eslint-disable-next-line no-console
                console.log("Variant promoted to master");
              }
            } else {
              const ok = await resumeService.setMasterResume(id);
              if (ok) {
                // eslint-disable-next-line no-console
                console.log("Orphan converted to master");
              }
            }
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error("Promote/Convert to master failed", err);
          }
        }}
      />
    </div>
  );
}
