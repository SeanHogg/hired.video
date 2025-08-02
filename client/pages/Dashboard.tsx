import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/lib/auth";
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
} from "lucide-react";

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, isAuthenticated } = useAuth();

  // If user is not authenticated, show CTA
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <Navigation
          onMenuClick={() => setSidebarOpen(true)}
          onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
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
                  Dashboard
                </span>
              </div>
              <h1 className="text-5xl font-bold mb-6">
                Your Personal Command Center
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                Access powerful insights, track your progress, and manage your career journey from one comprehensive dashboard.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8">
                    Get Started Free
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
                    }`}>
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
          </div>
        </div>
      </div>
    </div>
  );
}
