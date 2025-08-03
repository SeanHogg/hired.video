import {
  Users,
  FileText,
  Briefcase,
  Eye,
  TrendingUp,
  Clock,
  Target,
  CheckCircle2,
  ArrowRight,
  BarChart3,
  UserPlus,
  Download,
  Calendar,
  Building2,
  Video,
  Sparkles,
  Star,
  Filter,
  Grid,
  List,
  Play,
  MoreHorizontal,
  User,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";

// Content item types
interface VideoItem {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  views: number;
}

interface ResumeItem {
  id: string;
  title: string;
  type: string;
  size: string;
  lastModified: string;
}

interface JobItem {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
}

interface CompanyItem {
  id: string;
  name: string;
  industry: string;
  employees: string;
}

interface ProfileItem {
  id: string;
  name: string;
  role: string;
  location: string;
}

type ContentItem = VideoItem | ResumeItem | JobItem | CompanyItem | ProfileItem;

// Content data for the activity section
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

// Mock data for activity content
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

export default function Dashboard() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { user, isAuthenticated } = useAuth();

  // Activity content state
  const [selectedContentType, setSelectedContentType] = useState("videos");
  const [selectedFilter, setSelectedFilter] = useState("my-content");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // If user is not authenticated, show CTA
  if (!isAuthenticated || !user) {
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
                    <Video className="h-12 w-12 text-primary" />
                    <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    HR Dashboard
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  Your HR Command Center
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  Comprehensive talent management dashboard with social recruiting, ATS analytics, CRM insights, and recruitment marketing metrics all in one place.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8">
                      Get Started
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button size="lg" variant="outline" className="text-lg px-8">
                      Sign In
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Features Grid */}
              <div className="grid md:grid-cols-3 gap-8 mb-16">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <BarChart3 className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>Real-time Analytics</CardTitle>
                    <CardDescription>
                      Track your profile views, application success rates, and career progress with detailed metrics.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <Target className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>Goal Tracking</CardTitle>
                    <CardDescription>
                      Set and monitor your career goals with personalized recommendations and progress insights.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <CheckCircle2 className="h-10 w-10 text-primary mb-4" />
                    <CardTitle>Task Management</CardTitle>
                    <CardDescription>
                      Stay organized with guided onboarding tasks and personalized action items for your persona.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>

              {/* Persona-specific Benefits */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">Tailored for Your Role</h2>
                <div className="grid md:grid-cols-3 gap-8">
                  <Card className="text-center">
                    <CardHeader>
                      <Users className="h-12 w-12 mx-auto text-green-600 mb-4" />
                      <CardTitle>Job Seekers</CardTitle>
                      <CardDescription>
                        Track resume views, application status, interview requests, and career progress all in one place.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm text-left">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Resume analytics & optimization tips
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Job application tracking
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Interview preparation tools
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <Briefcase className="h-12 w-12 mx-auto text-blue-600 mb-4" />
                      <CardTitle>Recruiters</CardTitle>
                      <CardDescription>
                        Manage candidate pipelines, track placement rates, and optimize your recruitment workflow.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm text-left">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Candidate sourcing analytics
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Interview scheduling tools
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Placement success metrics
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <Building2 className="h-12 w-12 mx-auto text-purple-600 mb-4" />
                      <CardTitle>Businesses</CardTitle>
                      <CardDescription>
                        Monitor hiring operations, team growth, and recruitment ROI with comprehensive business insights.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm text-left">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Team growth analytics
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Hiring cost optimization
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Department-wise insights
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Final CTA */}
              <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
                <h3 className="text-2xl font-bold mb-4">Ready to Take Control of Your Career?</h3>
                <p className="text-muted-foreground mb-6">
                  Join thousands of professionals who are already using MyVideoResume to accelerate their careers.
                </p>
                <Link to="/signup">
                  <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
                    Start Your Dashboard Today
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

  // Persona-specific metrics
  const getMetricsForPersona = () => {
    switch (user.role) {
      case "job_seeker":
        return {
          title: "Job Seeker Dashboard",
          description: "Track your job search progress and opportunities",
          metrics: [
            { title: "Resume Views", value: "2,847", change: "+12%", icon: Eye, trend: "up" },
            { title: "Applications Sent", value: "45", change: "+8", icon: FileText, trend: "up" },
            { title: "Interview Requests", value: "12", change: "+3", icon: Calendar, trend: "up" },
            { title: "Profile Matches", value: "89%", change: "+5%", icon: Target, trend: "up" },
          ],
          recentActivity: [
            { type: "view", content: "Your resume was viewed by Google", time: "2 hours ago" },
            { type: "match", content: "New job match: Senior Developer at Meta", time: "5 hours ago" },
            { type: "application", content: "Application submitted to Stripe", time: "1 day ago" },
          ],
        };
      case "recruiter":
        return {
          title: "Recruiter Dashboard",
          description: "Manage candidates and track recruitment metrics",
          metrics: [
            { title: "Active Candidates", value: "1,247", change: "+18%", icon: Users, trend: "up" },
            { title: "Open Positions", value: "34", change: "+5", icon: Briefcase, trend: "up" },
            { title: "Interviews Scheduled", value: "28", change: "+12", icon: Calendar, trend: "up" },
            { title: "Placement Rate", value: "76%", change: "+3%", icon: TrendingUp, trend: "up" },
          ],
          recentActivity: [
            { type: "candidate", content: "New candidate: John Smith applied for Senior Dev role", time: "1 hour ago" },
            { type: "interview", content: "Interview scheduled with candidate for PM role", time: "3 hours ago" },
            { type: "placement", content: "Successful placement: Sarah Chen at Design Corp", time: "1 day ago" },
          ],
        };
      case "business":
        return {
          title: "Business Dashboard",
          description: "Overview of hiring operations and team metrics",
          metrics: [
            { title: "Total Employees", value: "485", change: "+12", icon: Building2, trend: "up" },
            { title: "Open Positions", value: "23", change: "-2", icon: Briefcase, trend: "down" },
            { title: "Time to Hire", value: "18 days", change: "-3 days", icon: Clock, trend: "up" },
            { title: "Hiring Success Rate", value: "82%", change: "+7%", icon: Target, trend: "up" },
          ],
          recentActivity: [
            { type: "hire", content: "New hire: Marcus Rodriguez joined as Data Scientist", time: "2 hours ago" },
            { type: "posting", content: "New job posting created: UX Designer", time: "4 hours ago" },
            { type: "team", content: "Engineering team reached 50 members milestone", time: "2 days ago" },
          ],
        };
      default:
        return getMetricsForPersona();
    }
  };

  const dashboardData = getMetricsForPersona();

  // Onboarding tasks based on persona
  const getOnboardingTasks = () => {
    const baseTasks = [
      { id: "profile", title: "Complete your profile", completed: true },
      { id: "preferences", title: "Set your preferences", completed: true },
      { id: "verification", title: "Verify your email", completed: true },
    ];

    switch (user.role) {
      case "job_seeker":
        return [
          ...baseTasks,
          { id: "resume", title: "Upload your resume", completed: true },
          { id: "video", title: "Create your video resume", completed: false },
          { id: "skills", title: "Add your skills and experience", completed: true },
          { id: "preferences", title: "Set job search preferences", completed: true },
        ];
      case "recruiter":
        return [
          ...baseTasks,
          { id: "company", title: "Set up company profile", completed: true },
          { id: "team", title: "Invite team members", completed: false },
          { id: "jobs", title: "Post your first job", completed: true },
          { id: "sourcing", title: "Set up candidate sourcing", completed: false },
        ];
      case "business":
        return [
          ...baseTasks,
          { id: "company", title: "Complete company information", completed: true },
          { id: "billing", title: "Set up billing information", completed: true },
          { id: "team", title: "Add team members", completed: false },
          { id: "integration", title: "Configure integrations", completed: false },
        ];
      default:
        return baseTasks;
    }
  };

  const onboardingTasks = getOnboardingTasks();
  const completedTasksCount = onboardingTasks.filter(task => task.completed).length;
  const progressPercentage = Math.round((completedTasksCount / onboardingTasks.length) * 100);

  // Helper function to render content items
  const renderContentItem = (item: ContentItem, type: string) => {
    switch (type) {
      case "videos":
        const videoItem = item as VideoItem;
        return (
          <Card key={videoItem.id} className="group cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="relative mb-3">
                <img
                  src={videoItem.thumbnail}
                  alt={videoItem.title}
                  className="w-full h-32 object-cover rounded-md bg-muted"
                />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md">
                  <Play className="h-8 w-8 text-white" />
                </div>
                <Badge className="absolute bottom-2 right-2 bg-black/70 text-white">
                  {videoItem.duration}
                </Badge>
              </div>
              <h3 className="font-medium text-sm mb-1 line-clamp-2">{videoItem.title}</h3>
              <p className="text-xs text-muted-foreground">{videoItem.views} views</p>
            </CardContent>
          </Card>
        );
      case "resumes":
        const resumeItem = item as ResumeItem;
        return (
          <Card key={resumeItem.id} className="group cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-md flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm mb-1 line-clamp-1">{resumeItem.title}</h3>
                  <p className="text-xs text-muted-foreground">{resumeItem.type} • {resumeItem.size}</p>
                  <p className="text-xs text-muted-foreground">{resumeItem.lastModified}</p>
                </div>
                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      case "jobs":
        const jobItem = item as JobItem;
        return (
          <Card key={jobItem.id} className="group cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-md flex items-center justify-center flex-shrink-0">
                  <Briefcase className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm mb-1 line-clamp-1">{jobItem.title}</h3>
                  <p className="text-xs text-muted-foreground">{jobItem.company}</p>
                  <p className="text-xs text-muted-foreground">{jobItem.location} • {jobItem.posted}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      case "companies":
        const companyItem = item as CompanyItem;
        return (
          <Card key={companyItem.id} className="group cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-md flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm mb-1 line-clamp-1">{companyItem.name}</h3>
                  <p className="text-xs text-muted-foreground">{companyItem.industry}</p>
                  <p className="text-xs text-muted-foreground">{companyItem.employees} employees</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      case "profiles":
        const profileItem = item as ProfileItem;
        return (
          <Card key={profileItem.id} className="group cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-md flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm mb-1 line-clamp-1">{profileItem.name}</h3>
                  <p className="text-xs text-muted-foreground">{profileItem.role}</p>
                  <p className="text-xs text-muted-foreground">{profileItem.location}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  const currentFilter = filterTypes.find(f => f.id === selectedFilter);
  const currentContentType = contentTypes.find(c => c.id === selectedContentType);

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
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-foreground">{dashboardData.title}</h1>
                <p className="text-muted-foreground mt-1">{dashboardData.description}</p>
              </div>
              <Badge variant="secondary" className="capitalize">
                {user.role?.replace('_', ' ')}
              </Badge>
            </div>

            {/* Onboarding Progress */}
            {progressPercentage < 100 && (
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Complete Your Setup
                      </CardTitle>
                      <CardDescription>
                        {completedTasksCount} of {onboardingTasks.length} tasks completed
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">{progressPercentage}%</div>
                      <div className="text-xs text-muted-foreground">Complete</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Progress value={progressPercentage} className="h-3 mb-4" />
                  <div className="grid gap-2">
                    {onboardingTasks.filter(task => !task.completed).slice(0, 2).map((task) => (
                      <div key={task.id} className="flex items-center justify-between p-3 bg-background rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 border-2 border-muted-foreground rounded-full" />
                          <span className="font-medium">{task.title}</span>
                        </div>
                        <Button size="sm" variant="outline">
                          Complete
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  {onboardingTasks.filter(task => !task.completed).length > 2 && (
                    <Link to="/onboarding">
                      <Button variant="link" className="mt-2 p-0">
                        View all tasks ({onboardingTasks.filter(task => !task.completed).length} remaining)
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {dashboardData.metrics.map((metric, index) => (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {metric.title}
                    </CardTitle>
                    <metric.icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{metric.value}</div>
                    <div className={`text-xs flex items-center gap-1 ${
                      metric.trend === 'up' ? 'text-green-600' : 'text-red-600'
                    }`}
                    >
                      <TrendingUp className={`h-3 w-3 ${metric.trend === 'down' ? 'rotate-180' : ''}`} />
                      {metric.change} from last month
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {dashboardData.recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                      <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{activity.content}</p>
                        <p className="text-xs text-muted-foreground">{activity.time}</p>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" className="w-full">
                    View All Activity
                  </Button>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {user.role === "job_seeker" && (
                    <>
                      <Button className="w-full justify-start gap-3" variant="outline">
                        <FileText className="h-4 w-4" />
                        Update Resume
                      </Button>
                      <Button className="w-full justify-start gap-3" variant="outline">
                        <Eye className="h-4 w-4" />
                        View Applications
                      </Button>
                      <Button className="w-full justify-start gap-3" variant="outline">
                        <Target className="h-4 w-4" />
                        Find New Jobs
                      </Button>
                    </>
                  )}
                  {user.role === "recruiter" && (
                    <>
                      <Button className="w-full justify-start gap-3" variant="outline">
                        <Briefcase className="h-4 w-4" />
                        Post New Job
                      </Button>
                      <Button className="w-full justify-start gap-3" variant="outline">
                        <Users className="h-4 w-4" />
                        Review Candidates
                      </Button>
                      <Button className="w-full justify-start gap-3" variant="outline">
                        <Calendar className="h-4 w-4" />
                        Schedule Interviews
                      </Button>
                    </>
                  )}
                  {user.role === "business" && (
                    <>
                      <Button className="w-full justify-start gap-3" variant="outline">
                        <Building2 className="h-4 w-4" />
                        View Team Analytics
                      </Button>
                      <Button className="w-full justify-start gap-3" variant="outline">
                        <UserPlus className="h-4 w-4" />
                        Invite Team Members
                      </Button>
                      <Button className="w-full justify-start gap-3" variant="outline">
                        <Download className="h-4 w-4" />
                        Export Reports
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Your Content Library Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {currentFilter?.icon && <currentFilter.icon className="h-5 w-5" />}
                    <CardTitle>Your Content Library</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4" />
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
                    <div className="flex items-center gap-1 border rounded-md">
                      <Button
                        variant={viewMode === "grid" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setViewMode("grid")}
                        className="rounded-r-none"
                      >
                        <Grid className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={viewMode === "list" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setViewMode("list")}
                        className="rounded-l-none"
                      >
                        <List className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <CardDescription>
                  Manage your saved content across all categories
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                      <div className={viewMode === "grid"
                        ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                        : "space-y-2"
                      }
                      >
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
              </CardContent>
            </Card>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
