import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  CheckSquare,
  Video,
  Sparkles,
  ArrowRight,
  Star,
  Calendar,
  Target,
  Clock,
  CheckCircle2,
  Play,
  Zap,
  BarChart3,
  Bell,
  List,
  Kanban,
  Filter,
  TrendingUp,
  Users,
  FileText,
} from "lucide-react";

export default function Tasks() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { isAuthenticated, user } = useAuth();

  // If user is not authenticated, show marketing page
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
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
          
          <div className="pt-16">
            <div className="max-w-6xl mx-auto px-4 py-16">
              {/* Hero Section */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center space-x-2 mb-6">
                  <div className="relative">
                    <CheckSquare className="h-12 w-12 text-primary" />
                    <Target className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    Smart Tasks
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  Organize Your Career Journey
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  Stay on top of your job search, hiring processes, and career goals with intelligent task management. Never miss an opportunity or deadline again.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8">
                      Get Organized Today
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    <Play className="mr-2 h-5 w-5" />
                    See Demo
                  </Button>
                </div>
              </div>

              {/* Stats Section */}
              <div className="grid md:grid-cols-4 gap-6 mb-16">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">40%</div>
                  <p className="text-sm text-muted-foreground">Faster job search completion</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">99%</div>
                  <p className="text-sm text-muted-foreground">On-time task completion</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">85%</div>
                  <p className="text-sm text-muted-foreground">Reduced stress levels</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">500K+</div>
                  <p className="text-sm text-muted-foreground">Tasks completed</p>
                </div>
              </div>

              {/* Features Grid */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">Everything You Need to Stay Organized</h2>
                <div className="grid md:grid-cols-3 gap-8">
                  <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                    <CardHeader>
                      <Kanban className="h-10 w-10 text-brand-purple mb-4" />
                      <CardTitle>Visual Task Boards</CardTitle>
                      <CardDescription>
                        Organize your job search with Kanban-style boards that adapt to your workflow and preferences.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Drag & drop interface
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Custom board templates
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Real-time collaboration
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                    <CardHeader>
                      <Bell className="h-10 w-10 text-brand-blue mb-4" />
                      <CardTitle>Smart Reminders</CardTitle>
                      <CardDescription>
                        AI-powered reminders that understand your priorities and help you stay on track with deadlines.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Intelligent scheduling
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Multi-channel notifications
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Priority-based alerts
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                    <CardHeader>
                      <BarChart3 className="h-10 w-10 text-primary mb-4" />
                      <CardTitle>Progress Analytics</CardTitle>
                      <CardDescription>
                        Track your productivity and success patterns with detailed analytics and insights.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Completion metrics
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Time tracking
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Success predictions
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Task Types */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">Task Types We Support</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  
                  <Card className="text-center p-6 hover:shadow-lg transition-shadow">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="h-8 w-8 text-green-600" />
                    </div>
                    <h3 className="font-semibold mb-2">Job Applications</h3>
                    <p className="text-sm text-muted-foreground mb-3">Track applications, deadlines, and follow-ups</p>
                    <Badge variant="outline" className="text-xs">Auto-tracking</Badge>
                  </Card>

                  <Card className="text-center p-6 hover:shadow-lg transition-shadow">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Calendar className="h-8 w-8 text-blue-600" />
                    </div>
                    <h3 className="font-semibold mb-2">Interviews</h3>
                    <p className="text-sm text-muted-foreground mb-3">Schedule, prepare, and track interviews</p>
                    <Badge variant="outline" className="text-xs">Smart prep</Badge>
                  </Card>

                  <Card className="text-center p-6 hover:shadow-lg transition-shadow">
                    <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Users className="h-8 w-8 text-purple-600" />
                    </div>
                    <h3 className="font-semibold mb-2">Networking</h3>
                    <p className="text-sm text-muted-foreground mb-3">Connect with professionals and follow up</p>
                    <Badge variant="outline" className="text-xs">Relationship CRM</Badge>
                  </Card>

                  <Card className="text-center p-6 hover:shadow-lg transition-shadow">
                    <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Target className="h-8 w-8 text-orange-600" />
                    </div>
                    <h3 className="font-semibold mb-2">Career Goals</h3>
                    <p className="text-sm text-muted-foreground mb-3">Set and achieve long-term career objectives</p>
                    <Badge variant="outline" className="text-xs">Goal tracking</Badge>
                  </Card>

                </div>
              </div>

              {/* Sample Task Board */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">See Your Tasks in Action</h2>
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-lg">
                  <div className="grid md:grid-cols-4 gap-4">
                    
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                        <h4 className="font-semibold text-sm">To Do</h4>
                        <Badge variant="secondary" className="text-xs">3</Badge>
                      </div>
                      <Card className="p-3 border-l-4 border-l-gray-400">
                        <div className="text-xs text-muted-foreground mb-1">Due tomorrow</div>
                        <div className="text-sm font-medium">Update LinkedIn profile</div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">Profile</Badge>
                        </div>
                      </Card>
                      <Card className="p-3 border-l-4 border-l-gray-400">
                        <div className="text-xs text-muted-foreground mb-1">This week</div>
                        <div className="text-sm font-medium">Research target companies</div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">Research</Badge>
                        </div>
                      </Card>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <h4 className="font-semibold text-sm">In Progress</h4>
                        <Badge variant="secondary" className="text-xs">2</Badge>
                      </div>
                      <Card className="p-3 border-l-4 border-l-blue-500">
                        <div className="text-xs text-muted-foreground mb-1">Started 2 days ago</div>
                        <div className="text-sm font-medium">Apply to Software Engineer role</div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">Application</Badge>
                        </div>
                      </Card>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                        <h4 className="font-semibold text-sm">Interview</h4>
                        <Badge variant="secondary" className="text-xs">1</Badge>
                      </div>
                      <Card className="p-3 border-l-4 border-l-yellow-500">
                        <div className="text-xs text-muted-foreground mb-1">Tomorrow 2:00 PM</div>
                        <div className="text-sm font-medium">Final round at TechCorp</div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">Interview</Badge>
                        </div>
                      </Card>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <h4 className="font-semibold text-sm">Completed</h4>
                        <Badge variant="secondary" className="text-xs">5</Badge>
                      </div>
                      <Card className="p-3 border-l-4 border-l-green-500">
                        <div className="text-xs text-muted-foreground mb-1">Completed yesterday</div>
                        <div className="text-sm font-medium">Send thank you email</div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">Follow-up</Badge>
                        </div>
                      </Card>
                    </div>

                  </div>
                </div>
              </div>

              {/* How It Works */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">How Smart Task Management Works</h2>
                <div className="grid md:grid-cols-4 gap-8">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <List className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">1. Create Tasks</h3>
                    <p className="text-sm text-muted-foreground">Add tasks manually or auto-import from applications</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Filter className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">2. Organize & Prioritize</h3>
                    <p className="text-sm text-muted-foreground">AI helps categorize and prioritize your tasks</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Bell className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">3. Get Reminders</h3>
                    <p className="text-sm text-muted-foreground">Smart notifications keep you on track</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <TrendingUp className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">4. Track Progress</h3>
                    <p className="text-sm text-muted-foreground">Monitor your success and optimize workflow</p>
                  </div>
                </div>
              </div>

              {/* Success Stories */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">Success Stories</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                      <p className="text-sm mb-4">
                        "The task management system helped me stay organized during my job search. I never missed a deadline or forgot to follow up. Got my dream job in 6 weeks!"
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                        <div>
                          <p className="font-medium text-sm">Rachel Thompson</p>
                          <p className="text-xs text-muted-foreground">Marketing Manager</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                      <p className="text-sm mb-4">
                        "As a recruiter, this helps me manage multiple candidates and hiring pipelines. The automation features saved me 10+ hours per week."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-blue to-brand-purple rounded-full" />
                        <div>
                          <p className="font-medium text-sm">Kevin Park</p>
                          <p className="text-xs text-muted-foreground">Senior Recruiter</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Final CTA */}
              <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
                <h3 className="text-2xl font-bold mb-4">Ready to Get Organized?</h3>
                <p className="text-muted-foreground mb-6">
                  Join thousands of professionals who have streamlined their career journeys with smart task management.
                </p>
                <Link to="/signup">
                  <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
                    Start Managing Tasks Today
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

  // If user is authenticated, show the actual tasks page (placeholder for now)
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
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Task Management</h1>
            <p className="text-muted-foreground mb-8">Organize your job search and career activities.</p>
            
            <div className="grid md:grid-cols-4 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                    To Do
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Your upcoming tasks will appear here</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    In Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Tasks you're currently working on</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    Interview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Scheduled interviews and prep tasks</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    Completed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Your completed tasks</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
