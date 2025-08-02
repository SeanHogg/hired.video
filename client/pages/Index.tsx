import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import VideoCard from "@/components/VideoCard";
import {
  Search,
  Filter,
  TrendingUp,
  Sparkles,
  User,
  Briefcase,
  Clock,
  Eye,
} from "lucide-react";

export default function Index() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Mock data for AI-generated videos
  const videos = [
    {
      id: "1",
      title: "Software Engineer Resume - Full Stack Developer with 5 Years Experience",
      description: "AI-generated video showcasing a full-stack developer's journey from junior to senior level, highlighting React, Node.js, and AWS expertise.",
      thumbnail: "",
      duration: "2:34",
      views: 12500,
      type: "resume" as const,
      profession: "Software Engineer",
      company: "Tech Startup",
      createdAt: "2024-01-15",
    },
    {
      id: "2",
      title: "Senior Product Manager Job Description - Remote Position at Fortune 500",
      description: "AI visualization of a senior product manager role requirements, responsibilities, and growth opportunities at a major technology company.",
      thumbnail: "",
      duration: "3:12",
      views: 8300,
      type: "job_description" as const,
      profession: "Product Manager",
      company: "Google",
      createdAt: "2024-01-14",
    },
    {
      id: "3",
      title: "UX Designer Portfolio - From Freelancer to Design Lead",
      description: "Creative AI presentation of a UX designer's career progression, showcasing key projects and design thinking process.",
      thumbnail: "",
      duration: "4:21",
      views: 15600,
      type: "resume" as const,
      profession: "UX Designer",
      company: "Design Agency",
      createdAt: "2024-01-13",
    },
    {
      id: "4",
      title: "Data Scientist Opening - Machine Learning Focus at Fintech Startup",
      description: "Dynamic presentation of data scientist role with focus on ML algorithms, Python expertise, and financial technology applications.",
      thumbnail: "",
      duration: "2:45",
      views: 6700,
      type: "job_description" as const,
      profession: "Data Scientist",
      company: "Stripe",
      createdAt: "2024-01-12",
    },
    {
      id: "5",
      title: "Marketing Manager Resume - Digital Marketing Specialist with ROI Focus",
      description: "AI-powered showcase of marketing achievements, campaign successes, and strategic thinking in digital marketing landscape.",
      thumbnail: "",
      duration: "3:08",
      views: 9400,
      type: "resume" as const,
      profession: "Marketing Manager",
      company: "E-commerce",
      createdAt: "2024-01-11",
    },
    {
      id: "6",
      title: "DevOps Engineer Position - Cloud Infrastructure & Kubernetes Expert",
      description: "Technical deep-dive into DevOps role requirements, showcasing AWS, Docker, and CI/CD pipeline expertise needed.",
      thumbnail: "",
      duration: "3:56",
      views: 11200,
      type: "job_description" as const,
      profession: "DevOps Engineer",
      company: "Netflix",
      createdAt: "2024-01-10",
    },
    {
      id: "7",
      title: "Sales Director Resume - B2B SaaS Revenue Growth Specialist",
      description: "Compelling narrative of sales leadership, team building, and revenue growth achievements in the SaaS industry.",
      thumbnail: "",
      duration: "2:52",
      views: 7800,
      type: "resume" as const,
      profession: "Sales Director",
      company: "SaaS Company",
      createdAt: "2024-01-09",
    },
    {
      id: "8",
      title: "Frontend Developer Job - React & TypeScript Expert for E-commerce",
      description: "Modern frontend development role showcasing React ecosystem, TypeScript mastery, and e-commerce platform experience.",
      thumbnail: "",
      duration: "2:18",
      views: 13900,
      type: "job_description" as const,
      profession: "Frontend Developer",
      company: "Shopify",
      createdAt: "2024-01-08",
    },
  ];

  const categories = [
    { id: "all", label: "All Videos", icon: TrendingUp },
    { id: "resume", label: "Resume Videos", icon: User },
    { id: "job_description", label: "Job Descriptions", icon: Briefcase },
  ];

  const filteredVideos = videos.filter((video) => {
    const matchesCategory = selectedCategory === "all" || video.type === selectedCategory;
    const matchesSearch = searchQuery === "" || 
      video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.profession?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.company?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesCategory && matchesSearch;
  });

  const totalViews = videos.reduce((sum, video) => sum + video.views, 0);
  const formatTotalViews = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={() => setSidebarOpen(true)}
          onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          sidebarCollapsed={sidebarCollapsed}
        />
      
      {/* Hero Section - Compact */}
      <section className="pt-20 pb-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-brand-purple/10 to-brand-blue/10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <Badge variant="secondary" className="mb-4 px-4 py-2 text-sm font-medium bg-brand-purple-light text-brand-purple-dark">
              <Sparkles className="w-4 h-4 mr-2" />
              AI-Generated Video Platform
            </Badge>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 leading-tight">
              Discover AI-Generated{" "}
              <span className="bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                Resume & Job Videos
              </span>
            </h1>
            
            <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
              Watch AI-powered video presentations of resumes and job descriptions. 
              Get inspired by career stories and discover perfect job opportunities.
            </p>

            {/* Quick Stats */}
            <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground mb-6">
              <div className="flex items-center gap-1">
                <Eye className="w-4 h-4" />
                <span>{formatTotalViews(totalViews)} total views</span>
              </div>
              <div className="flex items-center gap-1">
                <Sparkles className="w-4 h-4" />
                <span>{videos.length} AI videos</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>Updated daily</span>
              </div>
            </div>
          </div>
        </div>
      </section>

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
            </div>
          </div>
        </div>
      </section>

      {/* Video Grid */}
      <section className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Results Header */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {selectedCategory === "all" ? "All Videos" : 
               selectedCategory === "resume" ? "Resume Videos" : "Job Description Videos"}
            </h2>
            <p className="text-muted-foreground">
              {filteredVideos.length} videos found
              {searchQuery && ` for "${searchQuery}"`}
            </p>
          </div>

          {/* Video Grid */}
          {filteredVideos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredVideos.map((video) => (
                <VideoCard key={video.id} {...video} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No videos found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search or filters to find more content.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Upload CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-brand-purple to-brand-blue">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Create Your AI Video
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Upload your resume or job description and let our AI create a stunning 
            video presentation that stands out from the crowd.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" className="text-lg px-8 py-3 bg-white text-brand-purple hover:bg-white/90">
              Upload Resume
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 py-3 border-white/30 text-white hover:bg-white/10">
              Post Job Description
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-background border-t border-border">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-muted-foreground">
            &copy; 2024 MyVideoResume. Powered by AI to transform how we showcase talent and opportunities.
          </p>
        </div>
      </footer>
      </div>
    </div>
  );
}
