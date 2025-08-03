import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import VideoCard from "@/components/VideoCard";
import ResumeCard from "@/components/ResumeCard";
import JobCard from "@/components/JobCard";
import CompanyCard from "@/components/CompanyCard";
import PeopleCard from "@/components/PeopleCard";
import ActionsModal from "@/components/ActionsModal";
import HeroCarousel from "@/components/HeroCarousel";
import SearchBar, { SearchFilters } from "@/components/SearchBar";
import { getPublicJobs } from "@/data/mockJobs";
import { MOCK_COMPANIES } from "@/data/mockCompanies";
import { MOCK_USERS } from "@/data/mockPeople";
import { useSidebar } from "@/hooks/use-sidebar";
import { MOCK_RESUME_IDS, MOCK_RESUME_METADATA } from '@/data/mockResumes';

import {
  Search,
  Filter,
  TrendingUp,
  Sparkles,
  User,
  Briefcase,
  Clock,
  Eye,
  SlidersHorizontal,
  MapPin,
  GraduationCap,
  Calendar,
  X,
  ChevronDown,
  Building2,
  Grid,
  List
} from "lucide-react";

export default function Index() {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    searchRadius: "25",
    experienceLevel: "all",
    education: "all",
    datePosted: "all"
  });
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

  // Mock user state - in real app this would come from auth context
  const [currentUser] = useState(null);

  // Actions modal state
  const [actionsModal, setActionsModal] = useState<{
    isOpen: boolean;
    item: any | null;
  }>({
    isOpen: false,
    item: null,
  });



  // Action handlers
  const handleOpenActions = (item: any) => {
    setActionsModal({ isOpen: true, item });
  };

  const handleCloseActions = () => {
    setActionsModal({ isOpen: false, item: null });
  };

  const handleView = (item: any) => {
    if (item.type === 'resume') {
      navigate(`/resumes/${item.id}`);
    } else {
      console.log('View item:', item.id);
    }
  };

  const handleShare = (item: any) => {
    console.log('Share item:', item.id);
  };

  const handleEdit = (item: any) => {
    console.log('Edit item:', item.id);
  };

  const handleDownload = (item: any) => {
    console.log('Download item:', item.id);
  };

  const handleDelete = (item: any) => {
    console.log('Delete item:', item.id);
  };

  const handleTrack = (item: any) => {
    console.log('Track candidate:', item.id);
  };

  // Get real data from mock sources
  const realJobs = getPublicJobs().slice(0, 4);
  const realCompanies = MOCK_COMPANIES.slice(0, 4);
  const realPeople = MOCK_USERS.slice(0, 4);

  // Convert to unified content items
  const contentItems = [
    // People
    ...realPeople.map(person => ({
      id: person.id,
      name: `${person.data.firstName} ${person.data.lastName}`,
      title: person.data.headline,
      summary: person.data.summary,
      avatar: person.data.avatar,
      views: Math.floor(Math.random() * 500) + 50,
      type: "people" as const,
      contentType: "profile" as const,
      profession: person.data.headline.split(' | ')[0] || person.data.headline,
      company: person.data.experience[0]?.company || 'Independent',
      createdAt: person.createdAt,
      location: `${person.data.location.city}, ${person.data.location.state}`,
      role: person.role,
      isVerified: person.isVerified,
      isPremium: person.isPremium
    })),
    // Companies
    ...realCompanies.map(company => ({
      id: company.id,
      name: company.data.name,
      title: company.data.tagline,
      summary: company.data.description,
      logo: company.data.logo,
      views: company.views,
      type: "companies" as const,
      contentType: "profile" as const,
      profession: company.data.industry,
      company: company.data.name,
      createdAt: company.createdAt,
      location: `${company.data.headquarters.city}, ${company.data.headquarters.state}`,
      size: company.data.size,
      activeJobCount: company.activeJobCount,
      followers: company.followers
    })),
    // Resumes
    {
      id: MOCK_RESUME_IDS.SEAN_HOGG_MASTER,
      name: "Sean Hogg",
      title: "CTO and Technology Leader",
      summary: "CTO and Technology Leader with 25 years of experience driving business value through innovative technology solutions with amazing teams.",
      views: 45,
      type: "resume" as const,
      contentType: "text" as const,
      profession: "Technology Leader",
      company: "HireFractionalTalent.com",
      createdAt: "2024-01-15",
      ownerId: "1"
    },
    {
      id: MOCK_RESUME_IDS.SARAH_CHEN_RESUME,
      name: "Sarah Chen",
      title: "Senior Software Engineer",
      summary: "Passionate software engineer with 8 years of experience building scalable web applications. Expertise in React, Node.js, and cloud technologies.",
      views: 67,
      type: "resume" as const,
      contentType: "text" as const,
      profession: "Software Engineer",
      company: "TechCorp Inc",
      createdAt: "2024-01-10",
      ownerId: "4"
    },
    {
      id: MOCK_RESUME_IDS.MICHAEL_RODRIGUEZ,
      name: "Michael Rodriguez",
      title: "Senior Marketing Manager",
      summary: "Results-driven marketing professional with 7 years of experience in digital marketing, brand management, and growth strategy.",
      views: 2,
      type: "resume" as const,
      contentType: "text" as const,
      profession: "Marketing Manager",
      company: "GrowthCo",
      createdAt: "2024-01-28",
      ownerId: "5"
    },
    // Jobs
    ...realJobs.map(job => ({
      id: job.id,
      title: job.data.title,
      name: job.data.title,
      summary: job.data.summary,
      views: job.views,
      type: "job_listing" as const,
      contentType: "job" as const,
      profession: job.data.title,
      company: job.data.company.name,
      createdAt: job.createdAt,
      location: job.data.location.remote ? 'Remote' : `${job.data.location.city}, ${job.data.location.state}`,
      employmentType: job.data.employmentType,
      salaryMin: job.data.salaryMin,
      salaryMax: job.data.salaryMax,
      jobData: job
    }))
  ];

  const categories = [
    { id: "all", label: "All", icon: TrendingUp },
    { id: "people", label: "People", icon: User },
    { id: "companies", label: "Companies", icon: Building2 },
    { id: "resume", label: "Resumes", icon: User },
    { id: "job_description", label: "Jobs", icon: Briefcase },
  ];

  // Get real job data and convert to content items
  const realJobs = getPublicJobs().slice(0, 4).map(job => ({
    id: job.id,
    title: job.data.title,
    description: job.data.summary,
    thumbnail: "",
    duration: "",
    views: job.views,
    type: "job_listing" as const,
    contentType: "job" as const,
    profession: job.data.title,
    company: job.data.company.name,
    createdAt: job.createdAt,
    ownerId: job.userId,
    jobData: job
  }));

  // Combine mock content with real jobs
  const allContentItems = [
    ...contentItems.filter(item => item.type !== "job_description"), // Remove mock job descriptions
    ...realJobs
  ];

  const handleSearch = (query: string) => {
    setSearchFilters(prev => ({ ...prev, search: query }));
  };

  const handleFilterChange = (filters: SearchFilters) => {
    setSearchFilters(filters);
  };

  const handleClearFilters = () => {
    setSearchFilters({
      searchRadius: "25",
      experienceLevel: "all",
      education: "all",
      datePosted: "all"
    });
  };

  const filteredItems = allContentItems.filter((item) => {
    const searchQuery = searchFilters.search || "";
    const matchesCategory = selectedCategory === "all" ||
                           (selectedCategory === "job_description" && item.type === "job_listing") ||
                           (selectedCategory === "people" && item.type === "resume") ||
                           (selectedCategory === "companies" && false) || // No company data in current content
                           item.type === selectedCategory;
    const matchesSearch = searchQuery === "" ||
      (item.title && item.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.name && item.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.profession && item.profession.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.company && item.company.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesSearch;
  });

  const totalViews = allContentItems.reduce((sum, item) => sum + (item.views || 0), 0);
  const formatTotalViews = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

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
      
      {/* Hero Carousel */}
      <HeroCarousel
        totalViews={formatTotalViews(totalViews)}
        totalItems={contentItems.length}
      />

      {/* Search and Filters */}
      <section className="py-6 px-4 sm:px-6 lg:px-8 border-b border-border bg-background/80 backdrop-blur-md sticky top-16 z-40">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-4">
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
            <div className="flex gap-2 justify-center md:justify-start flex-wrap">
              {categories.map((category) => (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  className="gap-2"
                >
                  <category.icon className="w-4 h-4" />
                  {category.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Video Grid */}
      <section className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Results Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  {selectedCategory === "all" ? "All" :
                   selectedCategory === "people" ? "People" :
                   selectedCategory === "companies" ? "Companies" :
                   selectedCategory === "resume" ? "Resumes" : "Jobs"}
                </h2>
                <p className="text-muted-foreground">
                  {filteredItems.length} items found
                  {searchFilters.search && ` for "${searchFilters.search}"`}
                </p>
              </div>

              {/* View Toggle */}
              <div className="flex rounded-md border">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="rounded-r-none"
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="rounded-l-none"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Content Grid */}
          {filteredItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredItems.map((item) => {
                if (item.contentType === "job" && 'jobData' in item) {
                  // Use JobCard for real job listings
                  const jobMetadata = {
                    id: item.jobData.id,
                    title: item.jobData.data.title,
                    company: item.jobData.data.company.name,
                    location: item.jobData.data.location.remote
                      ? 'Remote'
                      : `${item.jobData.data.location.city}, ${item.jobData.data.location.state}`,
                    salary: item.jobData.data.salaryMin && item.jobData.data.salaryMax
                      ? `$${(item.jobData.data.salaryMin / 1000).toFixed(0)}k - $${(item.jobData.data.salaryMax / 1000).toFixed(0)}k`
                      : undefined,
                    employmentType: item.jobData.data.employmentType,
                    experienceLevel: item.jobData.data.experienceLevel,
                    status: item.jobData.status,
                    privacy: item.jobData.privacy,
                    createdAt: item.jobData.createdAt,
                    updatedAt: item.jobData.updatedAt,
                    expiresAt: item.jobData.expiresAt,
                    views: item.jobData.views,
                    applications: item.jobData.applications,
                    summary: item.jobData.data.summary,
                    userId: item.jobData.userId,
                    companyId: item.jobData.companyId
                  };

                  return (
                    <JobCard
                      key={item.id}
                      job={jobMetadata}
                    />
                  );
                } else if (item.contentType === "video") {
                  return (
                    <VideoCard
                      key={item.id}
                      {...item}
                      title={item.title || ''}
                      description={item.description || ''}
                      thumbnail={item.thumbnail || ''}
                      duration={item.duration || ''}
                      onView={() => handleView(item)}
                      onActions={() => handleOpenActions(item)}
                    />
                  );
                } else {
                  return (
                    <ResumeCard
                      key={item.id}
                      {...item}
                      name={item.name || ''}
                      summary={item.summary || ''}
                      onView={() => handleView(item)}
                      onActions={() => handleOpenActions(item)}
                    />
                  );
                }
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No content found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search or filters to find more resumes and videos.
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
        user={currentUser}
        onView={() => actionsModal.item && handleView(actionsModal.item)}
        onShare={() => actionsModal.item && handleShare(actionsModal.item)}
        onEdit={() => actionsModal.item && handleEdit(actionsModal.item)}
        onDownload={() => actionsModal.item && handleDownload(actionsModal.item)}
        onDelete={() => actionsModal.item && handleDelete(actionsModal.item)}
        onTrack={() => actionsModal.item && handleTrack(actionsModal.item)}
      />


    </div>
  );
}
