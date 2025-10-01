import {
  Briefcase,
  Video,
  Sparkles,
  ArrowRight,
  Star,
  Search,
  MapPin,
  Clock,
  DollarSign,
  CheckCircle2,
  Play,
  TrendingUp,
  Users,
  Building2,
  Target,
  Zap,
  BarChart3,
  Plus,
  Filter,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSEO } from "@/lib/seo";
import Footer from "@/components/Footer";
import JobCard from "@/components/JobCard";
import Navigation from "@/components/Navigation";
import Pagination, { usePagination } from "@/components/Pagination";
import type { SearchFilters } from "@/components/SearchBar";
import SearchBar from "@/components/SearchBar";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  jobService,
  type JobFilters,
  type JobSummary,
} from "@/lib/services/job-service";
import { companyService } from "@/lib/services/company-service";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth, USER_ROLES } from "@/lib/auth";
import type { JobWithOwnership } from "@/types/job";
import { useAI } from "@/lib/ai-context";
import { createJobContext } from "@/lib/utils/ai-context-helpers";

export default function Jobs() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  // SEO for jobs page
  useSEO(location.pathname);
  const { isAuthenticated, user } = useAuth();
  const { setPageContext } = useAI();
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [jobsData, setJobsData] = useState<{
    owned: JobWithOwnership[];
    tracked: JobWithOwnership[];
  }>({
    owned: [],
    tracked: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [totalJobs, setTotalJobs] = useState<number>(0);

  // Set AI context for this page
  useEffect(() => {
    // Skip AI context setup if window is not available (SSR)
    if (typeof window === "undefined") return;

    try {
      const context = createJobContext(
        "job-list",
        undefined,
        user?.role || "guest"
      );
      setPageContext(context);
    } catch (error) {
      console.error("Failed to set AI context:", error);
      // Don't break the page if AI context fails
    }

    // Clear context on unmount
    return () => {
      try {
        setPageContext(undefined);
      } catch (error) {
        console.error("Failed to clear AI context:", error);
      }
    };
  }, [user?.role, setPageContext]);

  // Pagination logic
  const {
    currentPage,
    itemsPerPage,
    totalPages,
    startIndex,
    endIndex,
    setCurrentPage,
    handleItemsPerPageChange,
    handleTotalItemsChange,
  } = usePagination(totalJobs, 9);

  // Fetch jobs data
  const fetchJobs = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const filters: JobFilters = {
        search: searchFilters.search || undefined,
        location: searchFilters.location || undefined,
        employmentType: searchFilters.employmentType || undefined,
        experienceLevel: searchFilters.experienceLevel || undefined,
        isRemote: searchFilters.remote || undefined,
        page: currentPage,
        limit: itemsPerPage,
      };

      const result = await jobService.getPublicJobs(filters);
      setJobs(result.items);
      setTotalJobs(result.total);
      handleTotalItemsChange(result.total);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
      setError("Failed to load jobs. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch jobs when filters or page changes
  useEffect(() => {
    fetchJobs();
  }, [searchFilters, currentPage, itemsPerPage]);

  // Handle job tracking
  const handleTrackJob = async (jobId: string) => {
    if (user) {
      try {
        await jobService.saveJob(jobId);
        // Refresh jobs to show updated state
        await fetchJobs();
      } catch (error) {
        console.error("Failed to save job:", error);
      }
    }
  };

  const handleUntrackJob = async (jobId: string) => {
    if (user) {
      try {
        await jobService.unsaveJob(jobId);
        // Refresh jobs to show updated state
        await fetchJobs();
      } catch (error) {
        console.error("Failed to unsave job:", error);
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

  // Temporary stub until owned/tracked jobs are wired
  const getJobsForUser = (): {
    owned: JobWithOwnership[];
    tracked: JobWithOwnership[];
  } => {
    return { owned: [], tracked: [] };
  };

  // Load user's jobs when authenticated - only when needed
  const loadUserJobsOnDemand = async () => {
    if (!isAuthenticated || !user) return;

    try {
      setIsLoading(true);
      // Get user's owned and tracked jobs
      const ownedJobs = await jobService.getUserJobs();
      const trackedJobs = await jobService.getSavedJobs();

      setJobsData({
        owned: ownedJobs.map((j) => ({
          ...j,
          company: j.company ?? "",
          location: j.location ?? "",
          employmentType: j.employmentType ?? "",
          ownership: "owned" as const,
          slug: (j as any).slug || "",
          experienceLevel: (j as any).experienceLevel || "entry",
          status: "active" as const,
          privacy: "public" as const,
          description: (j as any).description || "",
          views: (j as any).views || 0,
          applications: (j as any).applications || 0,
          summary: (j as any).summary || "",
          userId: (j as any).userId || "",
          createdAt: (j as any).createdAt || "",
          updatedAt: (j as any).updatedAt || "",
        })),
        tracked: trackedJobs.map((j) => ({
          ...j,
          company: j.company ?? "",
          location: j.location ?? "",
          employmentType: j.employmentType ?? "",
          ownership: "tracked" as const,
          slug: (j as any).slug || "",
          experienceLevel: (j as any).experienceLevel || "entry",
          status: "active" as const,
          privacy: "public" as const,
          description: (j as any).description || "",
          views: (j as any).views || 0,
          applications: (j as any).applications || 0,
          summary: (j as any).summary || "",
          userId: (j as any).userId || "",
          createdAt: (j as any).createdAt || "",
          updatedAt: (j as any).updatedAt || "",
        })),
      });
    } catch (error) {
      console.error("Failed to load user jobs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Only load user jobs when specifically needed (not on every page load)
  // This prevents the unnecessary /api/Job/saved API call
  // useEffect(() => {
  //   if (isAuthenticated && user) {
  //     loadUserJobsOnDemand();
  //   }
  // }, [isAuthenticated, user]);

  // If user is authenticated, show the actual jobs page
  if (isAuthenticated && user) {
    const isJobSeeker = user.role === USER_ROLES.JOB_SEEKER;
    const isRecruiterOrEmployer =
      user.role === USER_ROLES.RECRUITER || user.role === USER_ROLES.EMPLOYER;

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
                  <h1 className="text-3xl font-bold mb-2">Jobs</h1>
                  <p className="text-muted-foreground">
                    {isJobSeeker
                      ? "Discover and track job opportunities that match your skills"
                      : "Manage your job postings and discover talent"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isRecruiterOrEmployer && (
                    <Button asChild>
                      <Link to="/jobs/create">
                        <Plus className="h-4 w-4 mr-2" />
                        Post Job
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              {/* Search and Filters */}
              <div className="mb-6">
                <SearchBar
                  context="jobs"
                  value={searchFilters.search}
                  filters={searchFilters}
                  onSearch={handleSearch}
                  onFilterChange={handleFilterChange}
                  onClearFilters={handleClearFilters}
                />
              </div>

              {/* Job Listings */}
              <div className="space-y-6">
                {/* Owned Jobs (for recruiters/employers) */}
                {isRecruiterOrEmployer &&
                  "owned" in jobsData &&
                  jobsData.owned.length > 0 && (
                    <div>
                      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Briefcase className="h-5 w-5" />
                        Your Job Postings ({jobsData.owned.length})
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {jobsData.owned.map((job) => (
                          <JobCard
                            key={job.id}
                            job={job}
                            showOwnership
                            onTrack={handleTrackJob}
                            onUntrack={handleUntrackJob}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                {/* Tracked Jobs */}
                {("tracked" in jobsData
                  ? jobsData.tracked.length > 0
                  : false) && (
                  <div>
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Tracked Jobs ({(jobsData as any).tracked.length})
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {(jobsData as any).tracked.map(
                        (job: JobWithOwnership) => (
                          <JobCard
                            key={job.id}
                            job={job}
                            showOwnership
                            onTrack={handleTrackJob}
                            onUntrack={handleUntrackJob}
                          />
                        ),
                      )}
                    </div>
                  </div>
                )}

                {/* All Available Jobs */}
                <div>
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    {isJobSeeker ? "Available Jobs" : "All Jobs"}
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
                      <Button onClick={fetchJobs}>Try Again</Button>
                    </div>
                  ) : jobs.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-600 mb-4">
                        No jobs found matching your criteria.
                      </p>
                      <Button onClick={() => setSearchFilters({})}>
                        Clear Filters
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {jobs.map((job) => {
                        const jobMetadata = {
                          id: job.id,
                          slug: (job as any).slug || "",
                          title: job.title,
                          company: job.company,
                          companyId: (job as any).companyId || "",
                          location: job.location,
                          description: (job as any).description || "",
                          salary:
                            job.salaryMin && job.salaryMax
                              ? `$${(job.salaryMin / 1000).toFixed(0)}k - $${(job.salaryMax / 1000).toFixed(0)}k`
                              : undefined,
                          employmentType: job.employmentType,
                          experienceLevel:
                            (job as any).experienceLevel || "entry",
                          postedDate: job.postedDate || "",
                          isRemote: job.isRemote || false,
                          status: "active" as const,
                          privacy: "public" as const,
                          views: (job as any).views || 0,
                          applications: (job as any).applications || 0,
                          createdAt: (job as any).createdAt || "",
                          updatedAt: (job as any).updatedAt || "",
                          summary: (job as any).summary || "",
                          userId: (job as any).userId || "",
                        };

                        return (
                          <JobCard
                            key={job.id}
                            job={jobMetadata}
                            onTrack={handleTrackJob}
                            onUntrack={handleUntrackJob}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Pagination */}
                  {!isLoading && !error && jobs.length > 0 && (
                    <Pagination
                      currentPage={currentPage}
                      totalItems={totalJobs}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                      onItemsPerPageChange={handleItemsPerPageChange}
                    />
                  )}
                </div>
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
                  <Briefcase className="h-12 w-12 text-primary" />
                  <Video className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  Smart Jobs
                </span>
              </div>
              <h1 className="text-5xl font-bold mb-6">
                Discover Your Perfect Career Match
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                Find jobs that truly fit your skills and aspirations with
                AI-powered matching, video job descriptions, and direct
                connections to hiring managers.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    Find Your Dream Job
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/signup?role=recruiter">
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    <Plus className="mr-2 h-5 w-5" />
                    Post a Job
                  </Button>
                </Link>
              </div>
              <div className="mt-4 text-center">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                >
                  <Play className="mr-2 h-4 w-4" />
                  See How It Works
                </Button>
              </div>
            </div>

            {/* Stats Section */}
            <div className="grid md:grid-cols-4 gap-6 mb-16">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">50K+</div>
                <p className="text-sm text-muted-foreground">
                  Active job postings
                </p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">95%</div>
                <p className="text-sm text-muted-foreground">Match accuracy</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">72h</div>
                <p className="text-sm text-muted-foreground">
                  Average response time
                </p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">89%</div>
                <p className="text-sm text-muted-foreground">
                  Interview success rate
                </p>
              </div>
            </div>

            {/* Featured Jobs Preview using shared JobCard */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                Featured Opportunities
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                {jobs.slice(0, 2).map((job) => {
                  const jobMetadata = {
                    id: job.id,
                    slug: (job as any).slug || "",
                    title: job.title,
                    company: job.company,
                    companyId: (job as any).companyId || "",
                    location: job.location,
                    description: (job as any).description || "",
                    salary:
                      job.salaryMin && job.salaryMax
                        ? `$${(job.salaryMin / 1000).toFixed(0)}k - $${(job.salaryMax / 1000).toFixed(0)}k`
                        : undefined,
                    employmentType: job.employmentType,
                    experienceLevel: (job as any).experienceLevel || "entry",
                    postedDate: job.postedDate || "",
                    isRemote: job.isRemote || false,
                    status: "active" as const,
                    privacy: "public" as const,
                    views: (job as any).views || 0,
                    applications: (job as any).applications || 0,
                    createdAt: (job as any).createdAt || "",
                    updatedAt: (job as any).updatedAt || "",
                    summary: (job as any).summary || "",
                    userId: (job as any).userId || "",
                  };

                  return <JobCard key={job.id} job={jobMetadata} />;
                })}
              </div>
              <div className="text-center mt-8">
                <Link to="/signup">
                  <Button variant="outline" size="lg">
                    View All 50,000+ Jobs
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Features and other marketing content */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                Why Choose Our Job Platform
              </h2>
              <div className="grid md:grid-cols-3 gap-8">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <Target className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>AI-Powered Matching</CardTitle>
                    <CardDescription>
                      Our advanced AI analyzes your skills, experience, and
                      preferences to find jobs that truly match your career
                      goals.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <Video className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>Video Job Descriptions</CardTitle>
                    <CardDescription>
                      Get a real feel for the role with video job descriptions
                      from actual hiring managers and team members.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <Zap className="h-10 w-10 text-primary mb-4" />
                    <CardTitle>Direct Connections</CardTitle>
                    <CardDescription>
                      Skip the black hole of traditional applications. Connect
                      directly with hiring managers and decision makers.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>

            {/* Employer CTA */}
            <div className="mb-16">
              <div className="text-center bg-gradient-to-r from-green-50 to-blue-50 p-8 rounded-2xl border border-green-200/50">
                <Building2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-2xl font-bold mb-4">
                  Hiring? Find Top Talent Fast
                </h3>
                <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                  Post your job openings and connect with qualified candidates
                  who match your requirements. Our AI-powered platform helps you
                  find the right talent quickly.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup?role=recruiter">
                    <Button
                      size="lg"
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Plus className="mr-2 h-5 w-5" />
                      Post Your First Job Free
                    </Button>
                  </Link>
                  <Link to="/for-recruiters">
                    <Button size="lg" variant="outline">
                      Learn More About Hiring
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {/* Final CTA */}
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
              <h3 className="text-2xl font-bold mb-4">
                Ready to Find Your Perfect Job?
              </h3>
              <p className="text-muted-foreground mb-6">
                Join thousands of professionals who have found their dream
                careers through our platform.
              </p>
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                >
                  Start Your Job Search Today
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
