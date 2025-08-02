import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  Video,
  FileText,
  Briefcase,
  Building2,
  User,
  Filter,
  Grid,
  List,
  Clock,
  Star,
  Eye,
  Play,
  Download,
  Share,
  MoreHorizontal,
} from "lucide-react";

const contentTypes = [
  { id: "videos", label: "Videos", icon: Video },
  { id: "resumes", label: "Resumes", icon: FileText },
  { id: "jobs", label: "Job Postings", icon: Briefcase },
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "profiles", label: "Profiles", icon: User },
];

const filterTypes = [
  { id: "my-content", label: "My Content", icon: User },
  { id: "watch-later", label: "Watch Later", icon: Clock },
  { id: "favorites", label: "Favorites", icon: Star },
  { id: "recent", label: "Recently Viewed", icon: Eye },
];

// Mock data - in a real app this would come from an API
const mockContent = {
  videos: [
    { id: 1, title: "React Best Practices", duration: "15:30", views: 1200, thumbnail: "/placeholder.svg" },
    { id: 2, title: "TypeScript Advanced Tips", duration: "22:45", views: 850, thumbnail: "/placeholder.svg" },
  ],
  resumes: [
    { id: 1, title: "John Doe - Software Engineer", type: "PDF", size: "2.3 MB", lastModified: "2 days ago" },
    { id: 2, title: "Jane Smith - Product Manager", type: "PDF", size: "1.8 MB", lastModified: "1 week ago" },
  ],
  jobs: [
    { id: 1, title: "Senior Frontend Developer", company: "TechCorp", location: "Remote", posted: "3 days ago" },
    { id: 2, title: "Product Designer", company: "StartupXYZ", location: "San Francisco", posted: "1 week ago" },
  ],
  companies: [
    { id: 1, name: "TechCorp", industry: "Technology", employees: "1000+", logo: "/placeholder.svg" },
    { id: 2, name: "StartupXYZ", industry: "SaaS", employees: "50-100", logo: "/placeholder.svg" },
  ],
  profiles: [
    { id: 1, name: "John Doe", role: "Software Engineer", location: "New York", avatar: "/placeholder.svg" },
    { id: 2, name: "Jane Smith", role: "Product Manager", location: "San Francisco", avatar: "/placeholder.svg" },
  ],
};

export default function Watch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedContentType, setSelectedContentType] = useState("videos");
  const [selectedFilter, setSelectedFilter] = useState("my-content");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Get initial filter from URL params
  useEffect(() => {
    const filter = searchParams.get("filter");
    if (filter && filterTypes.some(f => f.id === filter)) {
      setSelectedFilter(filter);
    }
  }, [searchParams]);

  const currentFilter = filterTypes.find(f => f.id === selectedFilter);
  const currentContentType = contentTypes.find(c => c.id === selectedContentType);

  const renderContentItem = (item: any, type: string) => {
    switch (type) {
      case "videos":
        return (
          <Card key={item.id} className="group cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="relative mb-3">
                <img 
                  src={item.thumbnail} 
                  alt={item.title}
                  className="w-full h-32 object-cover rounded-md bg-muted"
                />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md">
                  <Play className="h-8 w-8 text-white" />
                </div>
                <Badge className="absolute bottom-2 right-2 bg-black/70 text-white">
                  {item.duration}
                </Badge>
              </div>
              <h3 className="font-medium text-sm mb-1 line-clamp-2">{item.title}</h3>
              <p className="text-xs text-muted-foreground">{item.views} views</p>
            </CardContent>
          </Card>
        );

      case "resumes":
        return (
          <Card key={item.id} className="group cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-md flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm mb-1 line-clamp-1">{item.title}</h3>
                  <p className="text-xs text-muted-foreground">{item.type} • {item.size}</p>
                  <p className="text-xs text-muted-foreground">{item.lastModified}</p>
                </div>
                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );

      case "jobs":
        return (
          <Card key={item.id} className="group cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-md flex items-center justify-center flex-shrink-0">
                  <Briefcase className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm mb-1 line-clamp-1">{item.title}</h3>
                  <p className="text-xs text-muted-foreground">{item.company}</p>
                  <p className="text-xs text-muted-foreground">{item.location} • {item.posted}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case "companies":
        return (
          <Card key={item.id} className="group cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-md flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm mb-1 line-clamp-1">{item.name}</h3>
                  <p className="text-xs text-muted-foreground">{item.industry}</p>
                  <p className="text-xs text-muted-foreground">{item.employees} employees</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case "profiles":
        return (
          <Card key={item.id} className="group cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-md flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm mb-1 line-clamp-1">{item.name}</h3>
                  <p className="text-xs text-muted-foreground">{item.role}</p>
                  <p className="text-xs text-muted-foreground">{item.location}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
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

        <div className="pt-16 px-4 py-6 container mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          {currentFilter?.icon && <currentFilter.icon className="h-5 w-5" />}
          <h1 className="text-2xl font-bold">{currentFilter?.label}</h1>
        </div>
        <p className="text-muted-foreground">
          Manage your saved content across all categories
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          <span className="text-sm font-medium">Filter:</span>
          <Select value={selectedFilter} onValueChange={setSelectedFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filterTypes.map((filter) => (
                <SelectItem key={filter.id} value={filter.id}>
                  <div className="flex items-center gap-2">
                    <filter.icon className="h-4 w-4" />
                    {filter.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant={viewMode === "grid" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("grid")}
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content Tabs */}
      <Tabs value={selectedContentType} onValueChange={setSelectedContentType}>
        <TabsList className="grid w-full grid-cols-5">
          {contentTypes.map((type) => (
            <TabsTrigger key={type.id} value={type.id} className="flex items-center gap-2">
              <type.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{type.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {contentTypes.map((type) => (
          <TabsContent key={type.id} value={type.id} className="mt-6">
            <div className={
              viewMode === "grid" 
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                : "space-y-2"
            }>
              {mockContent[type.id as keyof typeof mockContent]?.map((item) =>
                renderContentItem(item, type.id)
              )}
            </div>

            {mockContent[type.id as keyof typeof mockContent]?.length === 0 && (
              <div className="text-center py-12">
                <type.icon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No {type.label.toLowerCase()} found</h3>
                <p className="text-muted-foreground">
                  {selectedFilter === "my-content" && `You haven't created any ${type.label.toLowerCase()} yet.`}
                  {selectedFilter === "watch-later" && `You haven't saved any ${type.label.toLowerCase()} to watch later.`}
                  {selectedFilter === "favorites" && `You haven't favorited any ${type.label.toLowerCase()} yet.`}
                  {selectedFilter === "recent" && `You haven't viewed any ${type.label.toLowerCase()} recently.`}
                </p>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
        </div>
        <Footer />
      </div>
    </div>
  );
}
