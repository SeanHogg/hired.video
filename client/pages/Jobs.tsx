import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import JobCard from "@/components/JobCard";
import SearchBar, { SearchFilters } from "@/components/SearchBar";
import { useAuth } from "@/lib/auth";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  getAllJobsForUser,
  addTrackedJob,
  removeTrackedJob,
  getPublicJobs,
  getJobsByFilters
} from "@/data/mockJobs";
import { trackCompanyFromJobData } from "@/data/mockCompanies";
import { JobWithOwnership } from "@/types/job";
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
  Upload,
  Filter,
  X
} from "lucide-react";

export default function Jobs() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { isAuthenticated, user } = useAuth();
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});

  // Get jobs based on user role and authentication
  const getJobsForUser = () => {
    if (!user) {
      return getPublicJobs().map(job => ({
        ...job,
        title: job.data.title,
        company: job.data.company.name,
        location: job.data.location.remote 
          ? 'Remote' 
          : `${job.data.location.city}, ${job.data.location.state}`,
        salary: job.data.salaryMin && job.data.salaryMax 
          ? `$${(job.data.salaryMin / 1000).toFixed(0)}k - $${(job.data.salaryMax / 1000).toFixed(0)}k`
          : undefined,
        employmentType: job.data.employmentType,
        experienceLevel: job.data.experienceLevel,
        summary: job.data.summary
      }));
    }

    const { owned, tracked } = getAllJobsForUser(user.id);
    const ownedWithOwnership: JobWithOwnership[] = owned.map(job => ({
      id: job.id,
      title: job.data.title,
      company: job.data.company.name,
      location: job.data.location.remote 
        ? 'Remote' 
        : `${job.data.location.city}, ${job.data.location.state}`,
      salary: job.data.salaryMin && job.data.salaryMax 
        ? `$${(job.data.salaryMin / 1000).toFixed(0)}k - $${(job.data.salaryMax / 1000).toFixed(0)}k`
        : undefined,
      employmentType: job.data.employmentType,
      experienceLevel: job.data.experienceLevel,
      status: job.status,
      privacy: job.privacy,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      expiresAt: job.expiresAt,
      views: job.views,
      applications: job.applications,
      summary: job.data.summary,
      userId: job.userId,
      companyId: job.companyId,
      ownership: 'owned' as const
    }));

    const trackedWithOwnership: JobWithOwnership[] = tracked.map(job => ({
      id: job.id,
      title: job.data.title,
      company: job.data.company.name,
      location: job.data.location.remote 
        ? 'Remote' 
        : `${job.data.location.city}, ${job.data.location.state}`,
      salary: job.data.salaryMin && job.data.salaryMax 
        ? `$${(job.data.salaryMin / 1000).toFixed(0)}k - $${(job.data.salaryMax / 1000).toFixed(0)}k`
        : undefined,
      employmentType: job.data.employmentType,
      experienceLevel: job.data.experienceLevel,
      status: job.status,
      privacy: job.privacy,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      expiresAt: job.expiresAt,
      views: job.views,
      applications: job.applications,
      summary: job.data.summary,
      userId: job.userId,
      companyId: job.companyId,
      ownership: 'tracked' as const
    }));

    return { owned: ownedWithOwnership, tracked: trackedWithOwnership };
  };

  const handleTrackJob = (jobId: string) => {
    if (user) {
      addTrackedJob(jobId, user.id);
      // The addTrackedJob function will automatically track the company too
      // In a real app, you'd trigger a re-render here
    }
  };

  const handleUntrackJob = (jobId: string) => {
    if (user) {
      removeTrackedJob(jobId, user.id);
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

  // If user is authenticated, show the actual jobs page
  if (isAuthenticated && user) {
    const jobsData = getJobsForUser();
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
                  <h1 className="text-3xl font-bold mb-2">Jobs</h1>
                  <p className="text-muted-foreground">
                    {isJobSeeker 
                      ? "Discover and track job opportunities that match your skills" 
                      : "Manage your job postings and discover talent"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isRecruiterOrBusiness && (
                    <>
                      <Button asChild variant="outline">
                        <Link to="/jobs/upload">
                          <Upload className="h-4 w-4 mr-2" />
                          Import Job
                        </Link>
                      </Button>
                      <Button asChild>
                        <Link to="/jobs/create">
                          <Plus className="h-4 w-4 mr-2" />
                          Post Job
                        </Link>
                      </Button>
                    </>
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
                {/* Owned Jobs (for recruiters/business) */}
                {isRecruiterOrBusiness && 'owned' in jobsData && jobsData.owned.length > 0 && (
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
                          showOwnership={true}
                          onTrack={handleTrackJob}
                          onUntrack={handleUntrackJob}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Tracked Jobs */}
                {('tracked' in jobsData ? jobsData.tracked.length > 0 : false) && (
                  <div>
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Tracked Jobs ({(jobsData as any).tracked.length})
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {(jobsData as any).tracked.map((job: JobWithOwnership) => (
                        <JobCard 
                          key={job.id} 
                          job={job} 
                          showOwnership={true}
                          onTrack={handleTrackJob}
                          onUntrack={handleUntrackJob}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* All Available Jobs */}
                <div>
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    {isJobSeeker ? "Available Jobs" : "All Jobs"}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {getJobsByFilters({
                      search: searchFilters.search || "",
                      location: searchFilters.location,
                      employmentType: searchFilters.employmentType,
                      experienceLevel: searchFilters.experienceLevel,
                      remote: searchFilters.remote
                    }).map((job) => {
                      const jobMetadata = {
                        id: job.id,
                        title: job.data.title,
                        company: job.data.company.name,
                        location: job.data.location.remote 
                          ? 'Remote' 
                          : `${job.data.location.city}, ${job.data.location.state}`,
                        salary: job.data.salaryMin && job.data.salaryMax 
                          ? `$${(job.data.salaryMin / 1000).toFixed(0)}k - $${(job.data.salaryMax / 1000).toFixed(0)}k`
                          : undefined,
                        employmentType: job.data.employmentType,
                        experienceLevel: job.data.experienceLevel,
                        status: job.status,
                        privacy: job.privacy,
                        createdAt: job.createdAt,
                        updatedAt: job.updatedAt,
                        expiresAt: job.expiresAt,
                        views: job.views,
                        applications: job.applications,
                        summary: job.data.summary,
                        userId: job.userId,
                        companyId: job.companyId
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
                Find jobs that truly fit your skills and aspirations with AI-powered matching, video job descriptions, and direct connections to hiring managers.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8">
                    Find Your Dream Job
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
                <div className="text-3xl font-bold text-primary mb-2">50K+</div>
                <p className="text-sm text-muted-foreground">Active job postings</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">95%</div>
                <p className="text-sm text-muted-foreground">Match accuracy</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">72h</div>
                <p className="text-sm text-muted-foreground">Average response time</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-2">89%</div>
                <p className="text-sm text-muted-foreground">Interview success rate</p>
              </div>
            </div>

            {/* Featured Jobs Preview using shared JobCard */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">Featured Opportunities</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {getPublicJobs().slice(0, 2).map((job) => {
                  const jobMetadata = {
                    id: job.id,
                    title: job.data.title,
                    company: job.data.company.name,
                    location: job.data.location.remote 
                      ? 'Remote' 
                      : `${job.data.location.city}, ${job.data.location.state}`,
                    salary: job.data.salaryMin && job.data.salaryMax 
                      ? `$${(job.data.salaryMin / 1000).toFixed(0)}k - $${(job.data.salaryMax / 1000).toFixed(0)}k`
                      : undefined,
                    employmentType: job.data.employmentType,
                    experienceLevel: job.data.experienceLevel,
                    status: job.status,
                    privacy: job.privacy,
                    createdAt: job.createdAt,
                    updatedAt: job.updatedAt,
                    expiresAt: job.expiresAt,
                    views: job.views,
                    applications: job.applications,
                    summary: job.data.summary,
                    userId: job.userId,
                    companyId: job.companyId
                  };
                  
                  return (
                    <JobCard 
                      key={job.id} 
                      job={jobMetadata}
                    />
                  );
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
              <h2 className="text-3xl font-bold text-center mb-12">Why Choose Our Job Platform</h2>
              <div className="grid md:grid-cols-3 gap-8">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <Target className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>AI-Powered Matching</CardTitle>
                    <CardDescription>
                      Our advanced AI analyzes your skills, experience, and preferences to find jobs that truly match your career goals.
                    </CardDescription>
                  </CardHeader>
                </Card>
                
                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <Video className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>Video Job Descriptions</CardTitle>
                    <CardDescription>
                      Get a real feel for the role with video job descriptions from actual hiring managers and team members.
                    </CardDescription>
                  </CardHeader>
                </Card>
                
                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <Zap className="h-10 w-10 text-primary mb-4" />
                    <CardTitle>Direct Connections</CardTitle>
                    <CardDescription>
                      Skip the black hole of traditional applications. Connect directly with hiring managers and decision makers.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>

            {/* Final CTA */}
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
              <h3 className="text-2xl font-bold mb-4">Ready to Find Your Perfect Job?</h3>
              <p className="text-muted-foreground mb-6">
                Join thousands of professionals who have found their dream careers through our platform.
              </p>
              <Link to="/signup">
                <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
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
