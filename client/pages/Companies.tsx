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
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import CompanyCard from "@/components/CompanyCard";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Pagination, { usePagination } from "@/components/Pagination";
import SearchBar, { type SearchFilters } from "@/components/SearchBar";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { companyService, type CompanyFilters, type Company } from "@/lib/services/company-service";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import type { CompanyWithOwnership } from "@/types/company";

export default function Companies() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated, user } = useAuth();
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});
  const [companies, setCompanies] = useState<Company[]>([]);
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
      tracked: [] as CompanyWithOwnership[]
    };
  };

  // If user is authenticated, show the actual companies page
  if (isAuthenticated && user) {
    const companiesData = getCompaniesForUser();
    const isJobSeeker = user.role === "job_seeker";
    const isRecruiterOrBusiness =
      user.role === "recruiter" || user.role === "business";

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

          <div className="pt-16 p-6">
            <div className="max-w-7xl mx-auto">
              {/* Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-3xl font-bold mb-2">Companies</h1>
                  <p className="text-muted-foreground">
                    {isJobSeeker
                      ? "Discover and follow companies you're interested in"
                      : "Manage your company profile and discover other organizations"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isRecruiterOrBusiness && (
                    <Button asChild>
                      <Link to="/companies/create">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Company
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              {/* Search and Filters */}
              <div className="mb-6">
                <SearchBar
                  context="companies"
                  value={searchFilters.search}
                  filters={searchFilters}
                  onSearch={handleSearch}
                  onFilterChange={handleFilterChange}
                  onClearFilters={handleClearFilters}
                />
              </div>

              {/* Company Listings */}
              <div className="space-y-6">
                {/* Owned Companies (for recruiters/business) */}
                {isRecruiterOrBusiness &&
                  "owned" in companiesData &&
                  companiesData.owned.length > 0 && (
                    <div>
                      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Your Companies ({companiesData.owned.length})
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                  )}

                {/* Tracked Companies (for all users) */}
                {("tracked" in companiesData
                  ? companiesData.tracked.length > 0
                  : false) && (
                  <div>
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      Following ({(companiesData as any).tracked.length})
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {(companiesData as any).tracked.map(
                        (company: CompanyWithOwnership) => (
                          <CompanyCard
                            key={company.id}
                            company={company}
                            showOwnership
                            onTrack={handleTrackCompany}
                            onUntrack={handleUntrackCompany}
                          />
                        ),
                      )}
                    </div>
                  </div>
                )}

                {/* All Available Companies (for job seekers) or Discover Companies (for others) */}
                {(isJobSeeker ||
                  (!isJobSeeker &&
                    ("owned" in companiesData
                      ? companiesData.owned.length === 0
                      : true))) && (
                  <div>
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                      <Search className="h-5 w-5" />
                      {isJobSeeker ? "Discover Companies" : "Explore Companies"}
                    </h2>
                    {isLoading ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <div key={index} className="animate-pulse">
                            <div className="bg-gray-200 rounded-lg h-48"></div>
                          </div>
                        ))}
                      </div>
                    ) : error ? (
                      <div className="text-center py-12">
                        <p className="text-red-600 mb-4">{error}</p>
                        <Button onClick={fetchCompanies}>Try Again</Button>
                      </div>
                    ) : companies.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-gray-600 mb-4">No companies found matching your criteria.</p>
                        <Button onClick={() => setSearchFilters({})}>Clear Filters</Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {companies.map((company) => {
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
                            />
                          );
                        })}
                      </div>
                    )}

                    {/* Pagination */}
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
                )}

                {/* Empty State for Job Seekers with no tracked companies */}
                {isJobSeeker &&
                  "tracked" in companiesData &&
                  companiesData.tracked.length === 0 && (
                    <div className="text-center py-12">
                      <Building2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-xl font-semibold mb-2">
                        Start Following Companies
                      </h3>
                      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                        Discover companies you're interested in and track their
                        job openings. Following companies helps you stay updated
                        on new opportunities.
                      </p>
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          💡 <strong>Tip:</strong> When you track a job, we
                          automatically follow the company for you!
                        </p>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  // If user is not authenticated, show marketing page
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
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

        <div className="pt-16">
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
                <div className="text-3xl font-bold text-primary mb-2">98%</div>
                <p className="text-sm text-muted-foreground">
                  Profile accuracy
                </p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">24h</div>
                <p className="text-sm text-muted-foreground">
                  Average response time
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
          <Footer />
        </div>
      </div>
    </div>
  );
}
