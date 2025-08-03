import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import VideoCard from "@/components/VideoCard";
import ResumeCard from "@/components/ResumeCard";
import ActionsModal from "@/components/ActionsModal";
import HeroCarousel from "@/components/HeroCarousel";
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
} from "lucide-react";

export default function Index() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filters, setFilters] = useState({
    searchRadius: "25",
    experienceLevel: "all",
    education: "all",
    datePosted: "all"
  });

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
    console.log('View item:', item.id);
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

  // Mock data for AI-generated videos and resumes
  const contentItems = [
    {
      id: "1",
      title: "Software Engineer Resume - Full Stack Developer with 5 Years Experience",
      description: "AI-generated video showcasing a full-stack developer's journey from junior to senior level, highlighting React, Node.js, and AWS expertise.",
      thumbnail: "",
      duration: "2:34",
      views: 12500,
      type: "resume" as const,
      contentType: "video" as const,
      profession: "Software Engineer",
      company: "Tech Startup",
      createdAt: "2024-01-15",
      ownerId: "user456", // Different user
    },
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
      ownerId: "user_1", // Current user owns this
    },
    {
      id: "2",
      title: "Senior Product Manager Job Description - Remote Position at Fortune 500",
      description: "AI visualization of a senior product manager role requirements, responsibilities, and growth opportunities at a major technology company.",
      thumbnail: "",
      duration: "3:12",
      views: 8300,
      type: "job_description" as const,
      contentType: "video" as const,
      profession: "Product Manager",
      company: "Google",
      createdAt: "2024-01-14",
      ownerId: "company789", // Company owns this
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
      ownerId: "user_2", // Different user
    },
    {
      id: "3",
      title: "UX Designer Portfolio - From Freelancer to Design Lead",
      description: "Creative AI presentation of a UX designer's career progression, showcasing key projects and design thinking process.",
      thumbnail: "",
      duration: "4:21",
      views: 15600,
      type: "resume" as const,
      contentType: "video" as const,
      profession: "UX Designer",
      company: "Design Agency",
      createdAt: "2024-01-13",
      ownerId: "user789",
    },
    {
      id: "3a",
      name: "Marcus Rodriguez",
      title: "Senior Data Scientist",
      summary: "PhD in Machine Learning with 6 years of industry experience in predictive modeling, deep learning, and big data analytics. Expertise in Python, TensorFlow, and cloud platforms.",
      views: 2156,
      type: "resume" as const,
      contentType: "text" as const,
      profession: "Data Scientist",
      company: "Tech Company",
      createdAt: "2024-12-20",
      ownerId: "user456", // Different user
    },
    {
      id: "4",
      title: "Data Scientist Opening - Machine Learning Focus at Fintech Startup",
      description: "Dynamic presentation of data scientist role with focus on ML algorithms, Python expertise, and financial technology applications.",
      thumbnail: "",
      duration: "2:45",
      views: 6700,
      type: "job_description" as const,
      contentType: "video" as const,
      profession: "Data Scientist",
      company: "Stripe",
      createdAt: "2024-01-12",
      ownerId: "company789",
    },
    {
      id: "5",
      title: "Marketing Manager Resume - Digital Marketing Specialist with ROI Focus",
      description: "AI-powered showcase of marketing achievements, campaign successes, and strategic thinking in digital marketing landscape.",
      thumbnail: "",
      duration: "3:08",
      views: 9400,
      type: "resume" as const,
      contentType: "video" as const,
      profession: "Marketing Manager",
      company: "E-commerce",
      createdAt: "2024-01-11",
      ownerId: "user456",
    },
    {
      id: "6",
      title: "DevOps Engineer Position - Cloud Infrastructure & Kubernetes Expert",
      description: "Technical deep-dive into DevOps role requirements, showcasing AWS, Docker, and CI/CD pipeline expertise needed.",
      thumbnail: "",
      duration: "3:56",
      views: 11200,
      type: "job_description" as const,
      contentType: "video" as const,
      profession: "DevOps Engineer",
      company: "Netflix",
      createdAt: "2024-01-10",
      ownerId: "company789",
    },
    {
      id: "7",
      title: "Sales Director Resume - B2B SaaS Revenue Growth Specialist",
      description: "Compelling narrative of sales leadership, team building, and revenue growth achievements in the SaaS industry.",
      thumbnail: "",
      duration: "2:52",
      views: 7800,
      type: "resume" as const,
      contentType: "video" as const,
      profession: "Sales Director",
      company: "SaaS Company",
      createdAt: "2024-01-09",
      ownerId: "user456",
    },
    {
      id: "8",
      title: "Frontend Developer Job - React & TypeScript Expert for E-commerce",
      description: "Modern frontend development role showcasing React ecosystem, TypeScript mastery, and e-commerce platform experience.",
      thumbnail: "",
      duration: "2:18",
      views: 13900,
      type: "job_description" as const,
      contentType: "video" as const,
      profession: "Frontend Developer",
      company: "Shopify",
      createdAt: "2024-01-08",
      ownerId: "company789",
    },
  ];

  const categories = [
    { id: "all", label: "All", icon: TrendingUp },
    { id: "resume", label: "Resumes", icon: User },
    { id: "job_description", label: "Jobs", icon: Briefcase },
  ];

  const filteredItems = contentItems.filter((item) => {
    const matchesCategory = selectedCategory === "all" || item.type === selectedCategory;
    const matchesSearch = searchQuery === "" ||
      (item.title && item.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.name && item.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.profession && item.profession.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.company && item.company.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesSearch;
  });

  const totalViews = contentItems.reduce((sum, item) => sum + (item.views || 0), 0);
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
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search videos, professions, companies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Category Filters */}
            <div className="flex gap-2">
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

              {/* Advanced Filter Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="gap-2"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Advanced
                <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Advanced Filters Panel */}
          {showAdvancedFilters && (
            <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Advanced Filters</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilters({
                      searchRadius: "25",
                      experienceLevel: "all",
                      education: "all",
                      datePosted: "all"
                    });
                  }}
                  className="text-xs"
                >
                  Clear All
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Search Radius */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    Search Radius
                  </label>
                  <Select value={filters.searchRadius} onValueChange={(value) => setFilters({...filters, searchRadius: value})}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 miles</SelectItem>
                      <SelectItem value="10">10 miles</SelectItem>
                      <SelectItem value="25">25 miles</SelectItem>
                      <SelectItem value="50">50 miles</SelectItem>
                      <SelectItem value="100">100 miles</SelectItem>
                      <SelectItem value="remote">Remote</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Experience Level */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    Experience Level
                  </label>
                  <Select value={filters.experienceLevel} onValueChange={(value) => setFilters({...filters, experienceLevel: value})}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      <SelectItem value="entry">Entry Level</SelectItem>
                      <SelectItem value="mid">Mid Level</SelectItem>
                      <SelectItem value="senior">Senior Level</SelectItem>
                      <SelectItem value="executive">Executive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Education */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <GraduationCap className="w-3 h-3" />
                    Education
                  </label>
                  <Select value={filters.education} onValueChange={(value) => setFilters({...filters, education: value})}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Education</SelectItem>
                      <SelectItem value="high-school">High School</SelectItem>
                      <SelectItem value="associate">Associate Degree</SelectItem>
                      <SelectItem value="bachelor">Bachelor's Degree</SelectItem>
                      <SelectItem value="master">Master's Degree</SelectItem>
                      <SelectItem value="phd">PhD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Posted */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Date Posted
                  </label>
                  <Select value={filters.datePosted} onValueChange={(value) => setFilters({...filters, datePosted: value})}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Time</SelectItem>
                      <SelectItem value="24h">Last 24 hours</SelectItem>
                      <SelectItem value="3d">Last 3 days</SelectItem>
                      <SelectItem value="week">Last week</SelectItem>
                      <SelectItem value="month">Last month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Video Grid */}
      <section className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Results Header */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {selectedCategory === "all" ? "All" :
               selectedCategory === "resume" ? "Resumes" : "Jobs"}
            </h2>
            <p className="text-muted-foreground">
              {filteredItems.length} items found
              {searchQuery && ` for "${searchQuery}"`}
            </p>
          </div>

          {/* Content Grid */}
          {filteredItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredItems.map((item) => (
                item.contentType === "video" ? (
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
                ) : (
                  <ResumeCard
                    key={item.id}
                    {...item}
                    name={item.name || ''}
                    summary={item.summary || ''}
                    onView={() => handleView(item)}
                    onActions={() => handleOpenActions(item)}
                  />
                )
              ))}
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
