import {
  Building2,
  Video,
  Sparkles,
  ArrowRight,
  Star,
  Users,
  Clock,
  TrendingUp,
  CheckCircle2,
  Play,
  Target,
  Zap,
  BarChart3,
  Award,
  Globe,
  DollarSign,
  Plus,
  Search,
  Filter,
  X,
  Eye,
  Briefcase
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import CompanyCard from "@/components/CompanyCard";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Pagination, { usePagination } from "@/components/Pagination";
import type { SearchFilters } from "@/components/SearchBar";
import SearchBar from "@/components/SearchBar";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  getAllCompaniesForUser, 
  addTrackedCompany, 
  removeTrackedCompany, 
  getPublicCompanies,
  getCompaniesByFilters 
} from "@/data/mockCompanies";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import type { CompanyWithOwnership } from "@/types/company";

export default function Companies() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { isAuthenticated, user } = useAuth();
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});

  // Get filtered companies data
  const getFilteredCompanies = () => {
    return getCompaniesByFilters({
      search: searchFilters.search || "",
      industry: searchFilters.industry ? [searchFilters.industry] : undefined,
      size: searchFilters.size ? [searchFilters.size] : undefined,
      location: searchFilters.location
    });
  };

  const filteredCompanies = getFilteredCompanies();

  // Pagination logic
  const {
    currentPage,
    itemsPerPage,
    totalPages,
    startIndex,
    endIndex,
    setCurrentPage,
    handleItemsPerPageChange,
    handleTotalItemsChange
  } = usePagination(filteredCompanies.length, 9);

  // Update pagination when filtered companies change
  useEffect(() => {
    handleTotalItemsChange(filteredCompanies.length);
  }, [filteredCompanies.length, handleTotalItemsChange]);

  // Get paginated companies
  const paginatedCompanies = filteredCompanies.slice(startIndex, endIndex);

  // Get companies based on user role and authentication
  const getCompaniesForUser = () => {
    if (!user) {
      return getPublicCompanies().map(company => ({
        ...company,
        onboardingProgress: 100 // Public companies are fully set up
      }));
    }

    const { owned, tracked } = getAllCompaniesForUser(user.id);
    const ownedWithOwnership: CompanyWithOwnership[] = owned.map(company => {
      const completedTasks = company.onboardingTasks.filter(task => task.completed).length;
      const totalTasks = company.onboardingTasks.length;
      const onboardingProgress = Math.round((completedTasks / totalTasks) * 100);

      return {
        id: company.id,
        slug: company.slug,
        name: company.data.name,
        logo: company.data.logo,
        tagline: company.data.tagline,
        industry: company.data.industry,
        size: company.data.size,
        location: `${company.data.headquarters.city}, ${company.data.headquarters.state}`,
        status: company.status,
        visibility: company.visibility,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
        views: company.views,
        followers: company.followers,
        jobCount: company.jobCount,
        activeJobCount: company.activeJobCount,
        userId: company.userId,
        teamMembers: company.teamMembers,
        onboardingProgress,
        ownership: 'owned' as const
      };
    });

    const trackedWithOwnership: CompanyWithOwnership[] = tracked.map(company => {
      const completedTasks = company.onboardingTasks.filter(task => task.completed).length;
      const totalTasks = company.onboardingTasks.length;
      const onboardingProgress = Math.round((completedTasks / totalTasks) * 100);

      return {
        id: company.id,
        slug: company.slug,
        name: company.data.name,
        logo: company.data.logo,
        tagline: company.data.tagline,
        industry: company.data.industry,
        size: company.data.size,
        location: `${company.data.headquarters.city}, ${company.data.headquarters.state}`,
        status: company.status,
        visibility: company.visibility,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
        views: company.views,
        followers: company.followers,
        jobCount: company.jobCount,
        activeJobCount: company.activeJobCount,
        userId: company.userId,
        teamMembers: company.teamMembers,
        onboardingProgress,
        ownership: 'tracked' as const
      };
    });

    return { owned: ownedWithOwnership, tracked: trackedWithOwnership };
  };

  const handleTrackCompany = (companyId: string) => {
    if (user) {
      addTrackedCompany(companyId, user.id);
      // In a real app, you'd trigger a re-render here
    }
  };

  const handleUntrackCompany = (companyId: string) => {
    if (user) {
      removeTrackedCompany(companyId, user.id);
      // In a real app, you'd trigger a re-render here
    }
  };

  const handleSearch = (query: string) => {
    setSearchFilters(prev => ({ ...prev, search: query }));
  };

  const handleFilterChange = (filters: SearchFilters) => {
    setSearchFilters(filters);
  };

  const handleClearFilters = () => {
    setSearchFilters({});
  };

  // If user is authenticated, show the actual companies page
  if (isAuthenticated && user) {
    const companiesData = getCompaniesForUser();
    const isJobSeeker = user.role === 'job_seeker';
    const isRecruiterOrBusiness = user.role === 'recruiter' || user.role === 'business';

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
                {isRecruiterOrBusiness && 'owned' in companiesData && companiesData.owned.length > 0 && (
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
                {('tracked' in companiesData ? companiesData.tracked.length > 0 : false) && (
                  <div>
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      Following ({(companiesData as any).tracked.length})
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {(companiesData as any).tracked.map((company: CompanyWithOwnership) => (
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

                {/* All Available Companies (for job seekers) or Discover Companies (for others) */}
                {(isJobSeeker || (!isJobSeeker && ('owned' in companiesData ? companiesData.owned.length === 0 : true))) && (
                  <div>
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                      <Search className="h-5 w-5" />
                      {isJobSeeker ? "Discover Companies" : "Explore Companies"}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {paginatedCompanies.map((company) => {
                        const companyMetadata = {
                          id: company.id,
                          slug: company.slug,
                          name: company.data.name,
                          logo: company.data.logo,
                          tagline: company.data.tagline,
                          industry: company.data.industry,
                          size: company.data.size,
                          location: `${company.data.headquarters.city}, ${company.data.headquarters.state}`,
                          status: company.status,
                          visibility: company.visibility,
                          createdAt: company.createdAt,
                          updatedAt: company.updatedAt,
                          views: company.views,
                          followers: company.followers,
                          jobCount: company.jobCount,
                          activeJobCount: company.activeJobCount,
                          userId: company.userId,
                          teamMembers: company.teamMembers,
                          onboardingProgress: 100 // Public companies are complete
                        };
                        
                        return (
                          <CompanyCard 
                            key={company.id} 
                            company={companyMetadata}
                            onTrack={handleTrackCompany}
                            onUntrack={handleUntrackCompany}
                          />
                        );
                      })}
                    </div>

                    {/* Pagination */}
                    <Pagination
                      currentPage={currentPage}
                      totalItems={filteredCompanies.length}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                      onItemsPerPageChange={handleItemsPerPageChange}
                    />
                  </div>
                )}

                {/* Empty State for Job Seekers with no tracked companies */}
                {isJobSeeker && 'tracked' in companiesData && companiesData.tracked.length === 0 && (
                  <div className="text-center py-12">
                    <Building2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-xl font-semibold mb-2">Start Following Companies</h3>
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
                Explore company cultures, values, and job opportunities. Follow companies you're interested in and get notified about new openings.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8">
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
                <p className="text-sm text-muted-foreground">Active companies</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">15K+</div>
                <p className="text-sm text-muted-foreground">Open positions</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">98%</div>
                <p className="text-sm text-muted-foreground">Profile accuracy</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">24h</div>
                <p className="text-sm text-muted-foreground">Average response time</p>
              </div>
            </div>

            {/* Featured Companies using CompanyCard */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">Featured Companies</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {getPublicCompanies().slice(0, 3).map((company) => {
                  const companyMetadata = {
                    id: company.id,
                    slug: company.slug,
                    name: company.data.name,
                    logo: company.data.logo,
                    tagline: company.data.tagline,
                    industry: company.data.industry,
                    size: company.data.size,
                    location: `${company.data.headquarters.city}, ${company.data.headquarters.state}`,
                    status: company.status,
                    visibility: company.visibility,
                    createdAt: company.createdAt,
                    updatedAt: company.updatedAt,
                    views: company.views,
                    followers: company.followers,
                    jobCount: company.jobCount,
                    activeJobCount: company.activeJobCount,
                    userId: company.userId,
                    teamMembers: company.teamMembers,
                    onboardingProgress: 100
                  };
                  
                  return (
                    <CompanyCard 
                      key={company.id} 
                      company={companyMetadata}
                    />
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
              <h2 className="text-3xl font-bold text-center mb-12">Why Companies Choose Us</h2>
              <div className="grid md:grid-cols-3 gap-8">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <Building2 className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>Company Profiles</CardTitle>
                    <CardDescription>
                      Showcase your company culture, values, and opportunities with rich profiles and video content.
                    </CardDescription>
                  </CardHeader>
                </Card>
                
                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <Users className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>Talent Pipeline</CardTitle>
                    <CardDescription>
                      Build a following of interested candidates who want to hear about your opportunities.
                    </CardDescription>
                  </CardHeader>
                </Card>
                
                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <TrendingUp className="h-10 w-10 text-primary mb-4" />
                    <CardTitle>Growth Analytics</CardTitle>
                    <CardDescription>
                      Track follower growth, job performance, and hiring success with detailed analytics.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>

            {/* Final CTA */}
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
              <h3 className="text-2xl font-bold mb-4">Ready to Discover Great Companies?</h3>
              <p className="text-muted-foreground mb-6">
                Join thousands of professionals exploring company cultures and career opportunities.
              </p>
              <Link to="/signup">
                <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
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
