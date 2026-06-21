import { TABLE_SURFACE, TABLE_HEAD } from "@/lib/ui/table-surface";
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
  Trophy,
  MapPin,
  Briefcase,
} from "lucide-react";
import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import CompanyCard from "@/components/CompanyCard";
import TeamLeaderboardPanel from "@/components/companies/TeamLeaderboardPanel";
import ListsButton from "@/components/lists/ListsButton";
import AddToListMenu from "@/components/lists/AddToListMenu";
import { listsService } from "@/lib/services/lists-service";
import Pagination, { usePagination } from "@/components/Pagination";
import type { SearchFilters } from "@/components/SearchBar";
import {
  locationFilterFromQuery,
  applyLocationFilterToQuery,
} from "@/components/location/LocationFilter";
import LocationFilterButton from "@/components/location/LocationFilterButton";
import type { LocationFilter as LocationFilterValue } from "@/lib/services/locations-service";
import { COMPANY_SIZE_OPTIONS } from "@/lib/constants/company-constants";
import { INDUSTRIES } from "@/lib/constants/industries";
import { useHeaderFilters } from "@/lib/header-filters";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import HeaderSearch from "@/components/HeaderSearch";
import EntityHubShell, { type EntityHubTab } from "@/components/EntityHubShell";
import { COMPANIES_HUB_DEFAULT_TAB, COMPANIES_HUB_TABS } from "@/hooks/use-companies-tabs";
import { useSearchQueryParam } from "@/hooks/use-search-query-param";
import ViewModeToggle, { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { HorizontalScroller } from "@/components/HorizontalScroller";
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
  const { t } = useTranslation();
  const location = useLocation();
  // SEO for companies page
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("labels.companies"), url: "/companies" }]);
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // 2-char threshold via the shared hook so single-keystroke ?q=A
  // doesn't fire /api/companies/public. Header search owns the visible
  // input — this page only consumes the resolved filter.
  const { effective: urlQuery } = useSearchQueryParam();
  const urlIndustry = searchParams.get("industry") ?? "";
  const urlSize = searchParams.get("size") ?? "";
  const urlLocation = searchParams.get("location") ?? "";

  // Structured geo filter — shared component, same URL state-shape as Jobs /
  // People / Search so deep-links survive cross-surface nav. company-service
  // now honours the structured ids server-side via content_locations
  // (kind='company') as well as the free-text `location` fallback (#1178).
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

  useHeaderFilters([
    {
      key: "industry",
      label: t("fields.industry.label"),
      type: "select",
      options: INDUSTRIES.map((i) => ({ value: i, label: i })),
    },
    {
      key: "size",
      label: t("labels.companies.size"),
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
  const [viewMode, setViewMode] = useViewMode(
    "companies.browse",
    "grid",
    BROWSE_VIEW_MODES,
  );
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
  const [ownedCompanies, setOwnedCompanies] = useState<Company[]>([]);

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
        location: geoFilter.text || searchFilters.location || undefined,
        // Structured geo ids (#1178) — server resolves these against
        // content_locations(kind='company') for city/region deep-links.
        countryId: geoFilter.countryId ?? undefined,
        stateId: geoFilter.stateId ?? undefined,
        cityId: geoFilter.cityId ?? undefined,
        isRemote: geoFilter.remote ?? undefined,
        page: currentPage,
        limit: itemsPerPage,
      };

      const result = await companyService.getPublicCompanies(filters);
      setCompanies(result.items);
      setTotalCompanies(result.total);
      handleTotalItemsChange(result.total);
    } catch (err) {
      console.error("Failed to fetch companies:", err);
      setError(t("errors.companies.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [searchFilters, geoFilter, currentPage, itemsPerPage]);

  // Fetch companies when filters or page changes
  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    if (!isAuthenticated) {
      setOwnedCompanies([]);
      return;
    }
    let cancelled = false;
    companyService
      .getMyCompanies()
      .then((rows) => {
        if (!cancelled) setOwnedCompanies(rows);
      })
      .catch(() => {
        if (!cancelled) setOwnedCompanies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

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

  // Owned comes from /api/Companies/me. Tracked (follow graph) ships
  // with #361 follow-up; left empty until that route exists.
  const getCompaniesForUser = () => ({
    owned: ownedCompanies as unknown as CompanyWithOwnership[],
    tracked: [] as CompanyWithOwnership[],
  });

  // If user is authenticated, show the actual companies page
  if (isAuthenticated && user) {
    const companiesData = getCompaniesForUser();
    const trackedCompanyCount = companiesData.tracked.length;

    // The valid, displayable companies for the browse tab — shared by every
    // layout (Scroll / Grid / Table) so filtering + the metadata projection
    // live in one place.
    const browseCompanies = displayedCompanies.filter((company) =>
      isValidCompanyName(company.name),
    );

    // One card definition shared by the Scroll and Grid views so the full
    // handler wiring lives in a single place (Table renders its own dense
    // rows below).
    const renderCompanyCard = (company: Company) => {
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
          onTrack={handleFollowCompany}
          onUntrack={handleUnfollowCompany}
          extraMenuItems={
            <AddToListMenu
              entityType="company"
              entityId={company.id ?? ""}
              entityLabel={company.name ?? t("labels.companies.entityFallback")}
            />
          }
        />
      );
    };

    const renderBrowseBody = () => (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Search className="h-5 w-5" />
            {t("headings.companies.explore")}
          </h2>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="animate-pulse">
                  <div className="bg-muted rounded-lg h-48" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={fetchCompanies}>{t("actions.tryAgainCapital")}</Button>
            </div>
          ) : displayedCompanies.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                {listMembership
                  ? t("messages.companies.noneInListMatch")
                  : t("messages.companies.noneMatchCriteria")}
              </p>
              <Button onClick={() => setSearchFilters({})}>{t("actions.clearFilters")}</Button>
            </div>
          ) : viewMode === "table" ? (
            <CompaniesTable
              companies={browseCompanies}
              onView={(id) => navigate(`/companies/${id}`)}
            />
          ) : viewMode === "scroll" ? (
            <HorizontalScroller itemCount={browseCompanies.length}>
              {browseCompanies.map((company) => (
                <Fragment key={company.id}>
                  {renderCompanyCard(company)}
                </Fragment>
              ))}
            </HorizontalScroller>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {browseCompanies.map((company) => renderCompanyCard(company))}
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
          <h3 className="text-xl font-semibold mb-2">{t("headings.companies.noFollowedYet")}</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {t("messages.companies.noFollowedYet")}
          </p>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              💡 <strong>{t("messages.tipPrefix")}</strong> {t("messages.companies.autoFollowTip")}
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
          <h3 className="text-xl font-semibold mb-2">{t("headings.companies.noneYet")}</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {t("messages.companies.addProfilePrompt")}
          </p>
          <Button asChild>
            <Link to="/companies/create">
              <Plus className="h-4 w-4 mr-2" />
              {t("actions.companies.add")}
            </Link>
          </Button>
        </div>
      );

    const browseActions = (
      <>
        <LocationFilterButton
          value={geoFilter}
          onChange={handleGeoFilterChange}
          showRemote={false}
        />
        <ViewModeToggle
          value={viewMode}
          onChange={setViewMode}
          modes={BROWSE_VIEW_MODES}
        />
        <ListsButton entityType="company" />
      </>
    );

    const mineActions = (
      <>
        <Button asChild>
          <Link to="/companies/create">
            <Plus className="h-4 w-4 mr-2" />
            {t("actions.companies.add")}
          </Link>
        </Button>
        <ViewModeToggle
          value={viewMode}
          onChange={setViewMode}
          modes={BROWSE_VIEW_MODES}
        />
      </>
    );

    // Bodies keyed by tab — joined onto COMPANIES_HUB_TABS (the SSoT for
    // key / label / icon / roles / route) so the strip rendered on
    // /companies/:id / edit / create surfaces can never drift.
    const companyTabBodies: Record<string, Omit<EntityHubTab, "key" | "label" | "icon" | "roles"> | undefined> = {
      browse: {
        // `title` is required by EntityHubTab but ignored when `search` is
        // set — kept here only to satisfy the type contract.
        title: t("labels.companies"),
        search: <HeaderSearch />,
        headerActions: browseActions,
        body: renderBrowseBody,
      },
      connections: {
        title: t("labels.following"),
        description: t("messages.companies.followingDescription"),
        badge: trackedCompanyCount > 0 ? trackedCompanyCount : undefined,
        body: renderConnectionsBody,
      },
      mine: {
        title: t("headings.companies.mine"),
        description: t("messages.companies.mineDescription"),
        headerActions: mineActions,
        body: renderMineBody,
      },
      team: {
        title: t("headings.companies.teamLeaderboard"),
        description: t("messages.companies.teamLeaderboardDescription"),
        body: () => <TeamLeaderboardPanel />,
      },
    };
    const companyTabs: EntityHubTab[] = COMPANIES_HUB_TABS.map((meta) => {
      const body = companyTabBodies[meta.key];
      if (!body) throw new Error(`Missing body for company tab "${meta.key}"`);
      return { key: meta.key, label: meta.label, icon: meta.icon, roles: meta.roles, ...body };
    });

    return <EntityHubShell entity="company" tabs={companyTabs} defaultTab={COMPANIES_HUB_DEFAULT_TAB} />;
  }

  // If user is not authenticated, show marketing page
  return (
    <AppShell bgClassName="bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <div>
          <div className="px-4 py-16">
            {/* Hero Section */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center space-x-2 mb-6">
                <div className="relative">
                  <Building2 className="h-12 w-12 text-primary" />
                  <Video className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  {t("headings.companies.smartCompanies")}
                </span>
              </div>
              <h1 className="text-5xl font-bold mb-6">
                {t("headings.companies.heroTitle")}
              </h1>
              <p className="text-xl text-muted-foreground mb-8">
                {t("messages.companies.heroSubtitle")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    {t("actions.companies.explore")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="text-lg px-8">
                  <Play className="mr-2 h-5 w-5" />
                  {t("actions.seeHowItWorks")}
                </Button>
              </div>
            </div>

            {/* Stats Section */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">1K+</div>
                <p className="text-sm text-muted-foreground">
                  {t("labels.companies.statActiveCompanies")}
                </p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">15K+</div>
                <p className="text-sm text-muted-foreground">{t("labels.companies.statOpenPositions")}</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">{t("labels.companies.statVerified")}</div>
                <p className="text-sm text-muted-foreground">
                  {t("labels.companies.statCompanyProfiles")}
                </p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">{t("labels.companies.statFast")}</div>
                <p className="text-sm text-muted-foreground">
                  {t("labels.companies.statResponseTimes")}
                </p>
              </div>
            </div>

            {/* For employers — People Operations (CHRO) + embeddable.
                Shown on the unauthenticated /companies landing to pitch the
                paid employer product. */}
            <div className="mb-16 rounded-2xl border bg-card p-8">
              <div className="text-center mb-8">
                <span className="text-sm font-semibold text-primary uppercase tracking-wide">{t("labels.companies.forEmployers")}</span>
                <h2 className="text-3xl font-bold mt-2">{t("headings.companies.peopleOpsTitle")}</h2>
                <p className="text-muted-foreground mt-2">
                  {t("messages.companies.peopleOpsBlurb")}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center text-lg"><Users className="h-5 w-5 mr-2" /> {t("headings.companies.rosterOrgChart")}</CardTitle>
                    <CardDescription>{t("messages.companies.rosterOrgChartDesc")}</CardDescription>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center text-lg"><TrendingUp className="h-5 w-5 mr-2" /> {t("headings.companies.performance1on1s")}</CardTitle>
                    <CardDescription>{t("messages.companies.performance1on1sDesc")}</CardDescription>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center text-lg"><Building2 className="h-5 w-5 mr-2" /> {t("headings.companies.embedAnywhere")}</CardTitle>
                    <CardDescription>{t("messages.companies.embedAnywhereDesc")}</CardDescription>
                  </CardHeader>
                </Card>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
                <Link to="/people-operations">
                  <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
                    {t("actions.companies.explorePeopleOps")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button size="lg" variant="outline">{t("actions.seePricing")}</Button>
                </Link>
              </div>
            </div>

            {/* Featured Companies using CompanyCard */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t("headings.companies.featured")}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                    {t("actions.companies.viewAll")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Features */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t("headings.companies.whyChooseUs")}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <Building2 className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>{t("headings.companies.featProfiles")}</CardTitle>
                    <CardDescription>
                      {t("messages.companies.featProfilesDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <Users className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>{t("headings.companies.featTalentPipeline")}</CardTitle>
                    <CardDescription>
                      {t("messages.companies.featTalentPipelineDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <TrendingUp className="h-10 w-10 text-primary mb-4" />
                    <CardTitle>{t("headings.companies.featGrowthAnalytics")}</CardTitle>
                    <CardDescription>
                      {t("messages.companies.featGrowthAnalyticsDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>

            {/* Final CTA */}
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
              <h3 className="text-2xl font-bold mb-4">
                {t("headings.companies.ctaTitle")}
              </h3>
              <p className="text-muted-foreground mb-6">
                {t("messages.companies.ctaSubtitle")}
              </p>
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                >
                  {t("actions.companies.startExploring")}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
</div>
</AppShell>
  );
}

/**
 * Dense Table view of the browsed companies — the third browse layout
 * alongside Scroll and Grid. One row per company with industry, location,
 * size, open-role count and a View action. Pagination is owned by the
 * parent (shared `<Pagination>` below), so this renders exactly the rows
 * it's handed.
 */
function CompaniesTable({
  companies,
  onView,
}: {
  companies: Company[];
  onView: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={TABLE_SURFACE}>
      <table className="w-full text-left text-sm">
        <thead className={TABLE_HEAD}>
          <tr>
            <th className="px-3 py-2 font-medium">{t("labels.name", "Name")}</th>
            <th className="px-3 py-2 font-medium">{t("fields.industry.label", "Industry")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.location", "Location")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.companies.size", "Size")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("labels.companies.openRoles", "Open roles")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("labels.actions", "Actions")}</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => {
            const id = company.id ?? "";
            const openRoles = (company as any).activeJobCount ?? (company as any).jobCount ?? 0;
            return (
              <tr
                key={id}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onView(id)}
                    className="font-medium hover:text-brand-purple"
                  >
                    {company.name}
                  </button>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {company.industry || "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {company.location ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {company.location}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {company.size || "—"}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {openRoles}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onView(id)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {t("actions.view", "View")}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
