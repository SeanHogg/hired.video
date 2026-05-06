import {
  Building2,
  Video,
  ArrowRight,
  Users,
  TrendingUp,
  Play,
  Plus,
  Search,
  Eye,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import CompanyCard from "@/components/CompanyCard";
import ListsButton from "@/components/lists/ListsButton";
import AddToListMenu from "@/components/lists/AddToListMenu";
import { listsService } from "@/lib/services/lists-service";
import Pagination, { usePagination } from "@/components/Pagination";
import SearchBar, { type SearchFilters } from "@/components/SearchBar";
import { COMPANY_SIZE_OPTIONS } from "@/lib/constants/company-constants";
import { INDUSTRIES } from "@/lib/constants/industries";
import { useHeaderFilters } from "@/lib/header-filters";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import EntityHubShell, { type EntityHubTab } from "@/components/EntityHubShell";
import ViewModeToggle from "@/components/ViewModeToggle";
import { USER_ROLES } from "@shared/user-roles";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  companyService,
  type CompanyFilters,
  type CompanyMetadata as Company,
} from "@/lib/services/company-service";
import { useAuth } from "@/lib/auth";
import type { CompanyWithOwnership } from "@/types/company";
import { isValidCompanyName } from "@/lib/utils/company-validation";

export default function Companies() {
  const location = useLocation();
  // SEO for companies page
  useSEO(location.pathname);
  useBreadcrumbs([{ name: "Companies", url: "/companies" }]);
  const { isAuthenticated, user } = useAuth();
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const urlIndustry = searchParams.get("industry") ?? "";
  const urlSize = searchParams.get("size") ?? "";
  const urlLocation = searchParams.get("location") ?? "";

  useHeaderFilters([
    {
      key: "industry",
      label: "Industry",
      type: "select",
      options: INDUSTRIES.map((i) => ({ value: i, label: i })),
    },
    {
      key: "size",
      label: "Company size",
      type: "select",
      options: COMPANY_SIZE_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
      })),
    },
  ]);

  const [searchFilters, setSearchFilters] = useState<SearchFilters>(() => {
    const initial: SearchFilters = {};
    if (urlQuery) initial.search = urlQuery;
    if (urlIndustry) initial.industry = urlIndustry;
    if (urlSize) initial.size = urlSize;
    if (urlLocation) initial.location = urlLocation;
    return initial;
  });
  useEffect(() => {
    setSearchFilters((prev) => ({
      ...prev,
      search: urlQuery,
      industry: urlIndustry || undefined,
      size: urlSize || undefined,
      location: urlLocation || undefined,
    }));
  }, [urlQuery, urlIndustry, urlSize, urlLocation]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [companies, setCompanies] = useState<Company[]>([]);
  // Lists filter — same pattern as People/Jobs/Resumes.
  const listIdFromUrl = searchParams.get("list_id");
  const [listMembership, setListMembership] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!listIdFromUrl) {
      setListMembership(null);
      return;
    }
    let cancelled = false;
    listsService
      .getItems(listIdFromUrl, "company")
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

  const displayedCompanies = useMemo(
    () =>
      listMembership
        ? companies.filter((c) => listMembership.has(c.id ?? ""))
        : companies,
    [companies, listMembership],
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCompanies, setTotalCompanies] = useState<number>(0);

  // Pagination logic
  const {
    currentPage,
    itemsPerPage,
    totalPages: _totalPages,
    startIndex: _startIndex,
    endIndex: _endIndex,
    setCurrentPage,
    handleItemsPerPageChange,
    handleTotalItemsChange,
  } = usePagination(totalCompanies, 9);

  // Fetch companies data
  const fetchCompanies = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const filters: CompanyFilters = {
        search: searchFilters.search || undefined,
        industry: searchFilters.industry || undefined,
        size: searchFilters.size || undefined,
        location: searchFilters.location || undefined,
        page: currentPage,
        limit: itemsPerPage,
      };

      const result = await companyService.getPublicCompanies(filters);
      setCompanies(result.items);
      setTotalCompanies(result.total);
      handleTotalItemsChange(result.total);
    } catch (err) {
      console.error("Failed to fetch companies:", err);
      setError("Failed to load companies. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [searchFilters, currentPage, itemsPerPage]);

  // Fetch companies when filters or page changes
  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  // Note: User-specific company management (owned/tracked) will be implemented
  // when the backend API supports user company associations

  const handleFollowCompany = async (companyId: string) => {
    if (user) {
      try {
        await companyService.followCompany(companyId);
        // Refresh companies to show updated follow status
        await fetchCompanies();
      } catch (error) {
        console.error("Failed to follow company:", error);
      }
    }
  };

  const handleUnfollowCompany = async (companyId: string) => {
    if (user) {
      try {
        await companyService.unfollowCompany(companyId);
        // Refresh companies to show updated follow status
        await fetchCompanies();
      } catch (error) {
        console.error("Failed to unfollow company:", error);
      }
    }
  };

  const handleTrackCompany = async (companyId: string) => {
    if (user) {
      try {
        await companyService.followCompany(companyId);
        await fetchCompanies();
      } catch (error) {
        console.error("Failed to track company:", error);
      }
    }
  };

  const handleUntrackCompany = async (companyId: string) => {
    if (user) {
      try {
        await companyService.unfollowCompany(companyId);
        await fetchCompanies();
      } catch (error) {
        console.error("Failed to untrack company:", error);
      }
    }
  };

  const handleSearch = (query: string) => {
    setSearchFilters((prev) => ({ ...prev, search: query }));
  };

  const handleFilterChange = (filters: SearchFilters) => {
    setSearchFilters(filters);
  };

  const handleClearFilters = () => {
    setSearchFilters({});
  };

  // Get user-specific company data (owned and tracked companies)
  const getCompaniesForUser = () => {
    // TODO: Replace with actual API calls when backend supports user company associations
    // For now, return empty arrays as placeholder
    return {
      owned: [] as CompanyWithOwnership[],
      tracked: [] as CompanyWithOwnership[],
    };
  };

  // If user is authenticated, show the actual companies page
  if (isAuthenticated && user) {
    const companiesData = getCompaniesForUser();
    const trackedCompanyCount = companiesData.tracked.length;

    const browseSearchBar = (
      <div className="mb-6">
        <SearchBar
          context="companies"
          value={searchFilters.search}
          filters={searchFilters}
          onSearch={handleSearch}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
          hideSearchInput
          hideFilters
        />
      </div>
    );

    const renderBrowseBody = () => (
      <div className="space-y-6">
        {browseSearchBar}
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Search className="h-5 w-5" />
            Explore Companies
          </h2>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="animate-pulse">
                  <div className="bg-gray-200 rounded-lg h-48" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={fetchCompanies}>Try Again</Button>
            </div>
          ) : displayedCompanies.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 mb-4">
                {listMembership
                  ? "No companies in this list match your filters."
                  : "No companies found matching your criteria."}
              </p>
              <Button onClick={() => setSearchFilters({})}>Clear Filters</Button>
            </div>
          ) : (
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                  : "flex flex-col gap-4"
              }
            >
              {displayedCompanies
                .filter((company) => isValidCompanyName(company.name))
                .map((company) => {
                  const companyMetadata = {
                    id: company.id || "",
                    slug: (company as any).slug || "",
                    name: company.name || "",
                    logo: company.logo || "",
                    description: (company as any).description || "",
                    tagline: company.tagline || "",
                    industry: company.industry || "",
                    size: company.size || "",
                    location: company.location || "",
                    website: (company as any).website || "",
                    founded: (company as any).founded || "",
                    followersCount: (company as any).followersCount || 0,
                    jobsCount: (company as any).jobCount || 0,
                    isPublic: (company as any).isPublic || true,
                    status: (company.status as any) || "active",
                    visibility: (company.visibility as any) || "public",
                    createdAt: company.createdAt || "",
                    updatedAt: company.updatedAt || "",
                    teamMembers: (company as any).teamMembers || [],
                    onboardingProgress: company.onboardingProgress || 0,
                    views: (company as any).views || 0,
                    followers: (company as any).followers || 0,
                    jobCount: (company as any).jobCount || 0,
                    activeJobCount: (company as any).activeJobCount || 0,
                    userId: (company as any).userId || "",
                    ownership: "tracked" as const,
                  };
                  return (
                    <CompanyCard
                      key={company.id}
                      company={companyMetadata}
                      layout={viewMode === "list" ? "horizontal" : "vertical"}
                      onTrack={handleFollowCompany}
                      onUntrack={handleUnfollowCompany}
                      extraMenuItems={
                        <AddToListMenu
                          entityType="company"
                          entityId={company.id ?? ""}
                          entityLabel={company.name ?? "company"}
                        />
                      }
                    />
                  );
                })}
            </div>
          )}

          {!isLoading && !error && companies.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalItems={totalCompanies}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          )}
        </div>
      </div>
    );

    const renderConnectionsBody = () =>
      "tracked" in companiesData && companiesData.tracked.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {companiesData.tracked.map((company: CompanyWithOwnership) => (
            <CompanyCard
              key={company.id}
              company={company}
              showOwnership
              onTrack={handleTrackCompany}
              onUntrack={handleUntrackCompany}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Eye className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">No followed companies yet</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Discover companies you're interested in and track their job openings.
            Following companies helps you stay updated on new opportunities.
          </p>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              💡 <strong>Tip:</strong> When you track a job, we automatically follow the company for you!
            </p>
          </div>
        </div>
      );

    const renderMineBody = () =>
      "owned" in companiesData && companiesData.owned.length > 0 ? (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {companiesData.owned.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                showOwnership
                onTrack={handleTrackCompany}
                onUntrack={handleUntrackCompany}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <Building2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">No companies yet</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Add a company profile to manage jobs, candidates, and team members.
          </p>
          <Button asChild>
            <Link to="/companies/create">
              <Plus className="h-4 w-4 mr-2" />
              Add Company
            </Link>
          </Button>
        </div>
      );

    const browseActions = (
      <>
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
        <ListsButton entityType="company" />
      </>
    );

    const mineActions = (
      <>
        <Button asChild>
          <Link to="/companies/create">
            <Plus className="h-4 w-4 mr-2" />
            Add Company
          </Link>
        </Button>
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </>
    );

    const companyTabs: EntityHubTab[] = [
      {
        key: "browse",
        label: "Companies",
        icon: Building2,
        roles: [USER_ROLES.JOB_SEEKER, USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.ADMIN],
        title: "Companies",
        description: "Discover and explore companies",
        headerActions: browseActions,
        body: renderBrowseBody,
      },
      {
        key: "connections",
        label: "Following",
        icon: Eye,
        roles: [USER_ROLES.JOB_SEEKER, USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.ADMIN],
        title: "Following",
        description: "Companies you're following.",
        badge: trackedCompanyCount > 0 ? trackedCompanyCount : undefined,
        body: renderConnectionsBody,
      },
      {
        key: "mine",
        label: "My Companies",
        icon: Building2,
        roles: [USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.ADMIN],
        title: "My Companies",
        description: "Companies you manage.",
        headerActions: mineActions,
        body: renderMineBody,
      },
    ];

    return <EntityHubShell entity="company" tabs={companyTabs} defaultTab="browse" />;
  }

  // If user is not authenticated, show marketing page
  return (
    <AppShell bgClassName="bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <div>
          <div className="max-w-6xl mx-auto px-4 py-16">
            {/* Hero Section */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center space-x-2 mb-6">
                <div className="relative">
                  <Building2 className="h-12 w-12 text-primary" />
                  <Video className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  Smart Companies
                </span>
              </div>
              <h1 className="text-5xl font-bold mb-6">
                Discover Your Next Opportunity
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                Explore company cultures, values, and job opportunities. Follow
                companies you're interested in and get notified about new
                openings.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    Explore Companies
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="text-lg px-8">
                  <Play className="mr-2 h-5 w-5" />
                  See How It Works
                </Button>
              </div>
            </div>

            {/* Stats Section */}
            <div className="grid md:grid-cols-4 gap-6 mb-16">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">1K+</div>
                <p className="text-sm text-muted-foreground">
                  Active companies
                </p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">15K+</div>
                <p className="text-sm text-muted-foreground">Open positions</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">Verified</div>
                <p className="text-sm text-muted-foreground">
                  Company profiles
                </p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">Fast</div>
                <p className="text-sm text-muted-foreground">
                  Response times
                </p>
              </div>
            </div>

            {/* Featured Companies using CompanyCard */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                Featured Companies
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {companies
                  .filter((company) => isValidCompanyName((company as any).name))
                  .slice(0, 3)
                  .map((company) => {
                    const companyMetadata = {
                      id: company.id || "",
                      slug: company.slug || "",
                      name: (company as any).name || "",
                      logo: (company as any).logo || "",
                      tagline: company.tagline || "",
                      industry: company.industry || "",
                      size: company.size || "",
                      location: company.location || "",
                      status: (company.status as any) || "active",
                      visibility: (company.visibility as any) || "public",
                      createdAt: company.createdAt || "",
                      updatedAt: company.updatedAt || "",
                      views: (company as any).views || 0,
                      followers: (company as any).followers || 0,
                      jobCount: (company as any).jobCount || 0,
                      activeJobCount: (company as any).activeJobCount || 0,
                      userId: (company as any).userId || "",
                      teamMembers: (company as any).teamMembers || [],
                      onboardingProgress: company.onboardingProgress || 100,
                      ownership: "tracked" as const,
                    };

                    return (
                      <CompanyCard key={company.id} company={companyMetadata} />
                    );
                  })}
              </div>
              <div className="text-center mt-8">
                <Link to="/signup">
                  <Button variant="outline" size="lg">
                    View All Companies
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Features */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                Why Companies Choose Us
              </h2>
              <div className="grid md:grid-cols-3 gap-8">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <Building2 className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>Company Profiles</CardTitle>
                    <CardDescription>
                      Showcase your company culture, values, and opportunities
                      with rich profiles and video content.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <Users className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>Talent Pipeline</CardTitle>
                    <CardDescription>
                      Build a following of interested candidates who want to
                      hear about your opportunities.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <TrendingUp className="h-10 w-10 text-primary mb-4" />
                    <CardTitle>Growth Analytics</CardTitle>
                    <CardDescription>
                      Track follower growth, job performance, and hiring success
                      with detailed analytics.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>

            {/* Final CTA */}
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
              <h3 className="text-2xl font-bold mb-4">
                Ready to Discover Great Companies?
              </h3>
              <p className="text-muted-foreground mb-6">
                Join thousands of professionals exploring company cultures and
                career opportunities.
              </p>
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                >
                  Start Exploring Today
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
</div>
</AppShell>
  );
}
