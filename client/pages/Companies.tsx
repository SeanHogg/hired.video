import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth";
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
} from "lucide-react";

export default function Companies() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
                    <Building2 className="h-12 w-12 text-primary" />
                    <Video className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    For Companies
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  Revolutionize Your Hiring Process
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  Attract top talent with video job postings, streamline recruitment with AI-powered matching, and make better hiring decisions faster.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8">
                      Start Free Trial
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    <Play className="mr-2 h-5 w-5" />
                    Watch Demo
                  </Button>
                </div>
              </div>

              {/* Stats Section */}
              <div className="grid md:grid-cols-4 gap-6 mb-16">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">60%</div>
                  <p className="text-sm text-muted-foreground">Faster hiring process</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">3x</div>
                  <p className="text-sm text-muted-foreground">Better candidate quality</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">40%</div>
                  <p className="text-sm text-muted-foreground">Reduced cost per hire</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">95%</div>
                  <p className="text-sm text-muted-foreground">Client satisfaction rate</p>
                </div>
              </div>

              {/* Features Grid */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">Everything You Need to Hire Better</h2>
                <div className="grid md:grid-cols-3 gap-8">
                  <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                    <CardHeader>
                      <Video className="h-10 w-10 text-brand-purple mb-4" />
                      <CardTitle>Video Job Postings</CardTitle>
                      <CardDescription>
                        Create compelling video job descriptions that showcase your company culture and attract the right candidates.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Professional video templates
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Company culture showcase
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Team introduction videos
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                    <CardHeader>
                      <Target className="h-10 w-10 text-brand-blue mb-4" />
                      <CardTitle>AI-Powered Matching</CardTitle>
                      <CardDescription>
                        Our advanced AI finds the perfect candidates based on skills, experience, and cultural fit.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Smart candidate screening
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Skills assessment integration
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Cultural fit analysis
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                    <CardHeader>
                      <BarChart3 className="h-10 w-10 text-primary mb-4" />
                      <CardTitle>Hiring Analytics</CardTitle>
                      <CardDescription>
                        Get detailed insights into your hiring process and optimize for better results and cost efficiency.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Time-to-hire tracking
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Cost-per-hire analysis
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Quality of hire metrics
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Company Showcase */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">Trusted by Leading Companies</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card className="text-center p-6">
                    <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <span className="text-white font-bold text-xl">TC</span>
                    </div>
                    <h3 className="font-semibold mb-1">TechCorp</h3>
                    <p className="text-sm text-muted-foreground">500+ employees</p>
                    <Badge variant="outline" className="mt-2">Technology</Badge>
                  </Card>

                  <Card className="text-center p-6">
                    <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-green-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <span className="text-white font-bold text-xl">GD</span>
                    </div>
                    <h3 className="font-semibold mb-1">Growth Dynamics</h3>
                    <p className="text-sm text-muted-foreground">1000+ employees</p>
                    <Badge variant="outline" className="mt-2">SaaS</Badge>
                  </Card>

                  <Card className="text-center p-6">
                    <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <span className="text-white font-bold text-xl">IS</span>
                    </div>
                    <h3 className="font-semibold mb-1">InnovateSoft</h3>
                    <p className="text-sm text-muted-foreground">250+ employees</p>
                    <Badge variant="outline" className="mt-2">Startup</Badge>
                  </Card>

                  <Card className="text-center p-6">
                    <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <span className="text-white font-bold text-xl">DC</span>
                    </div>
                    <h3 className="font-semibold mb-1">Design Corp</h3>
                    <p className="text-sm text-muted-foreground">150+ employees</p>
                    <Badge variant="outline" className="mt-2">Design</Badge>
                  </Card>
                </div>
              </div>

              {/* How It Works */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">How It Works for Companies</h2>
                <div className="grid md:grid-cols-4 gap-8">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Video className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">1. Create Video Jobs</h3>
                    <p className="text-sm text-muted-foreground">Post jobs with video descriptions and company culture</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Target className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">2. AI Finds Matches</h3>
                    <p className="text-sm text-muted-foreground">Our AI identifies the best candidates for your roles</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Users className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">3. Review Candidates</h3>
                    <p className="text-sm text-muted-foreground">See video resumes and candidate profiles</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Award className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">4. Hire & Analyze</h3>
                    <p className="text-sm text-muted-foreground">Make offers and track hiring success</p>
                  </div>
                </div>
              </div>

              {/* Pricing Preview */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">Simple, Transparent Pricing</h2>
                <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
                  <Card>
                    <CardHeader className="text-center">
                      <CardTitle>Startup</CardTitle>
                      <div className="text-3xl font-bold">$99<span className="text-base font-normal">/month</span></div>
                      <CardDescription>Perfect for small teams</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Up to 5 job postings
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Basic analytics
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Email support
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-primary">
                    <CardHeader className="text-center">
                      <Badge className="mb-2">Most Popular</Badge>
                      <CardTitle>Growth</CardTitle>
                      <div className="text-3xl font-bold">$299<span className="text-base font-normal">/month</span></div>
                      <CardDescription>For growing companies</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Unlimited job postings
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Advanced analytics
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Priority support
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="text-center">
                      <CardTitle>Enterprise</CardTitle>
                      <div className="text-3xl font-bold">Custom</div>
                      <CardDescription>For large organizations</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Custom integrations
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Dedicated account manager
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          24/7 support
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Success Stories */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">What Our Clients Say</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                      <p className="text-sm mb-4">
                        "MyVideoResume transformed our hiring process. We're now hiring 60% faster and the quality of candidates has improved dramatically. The video job postings help candidates understand our culture before applying."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full flex items-center justify-center">
                          <span className="text-white font-semibold text-sm">SJ</span>
                        </div>
                        <div>
                          <p className="font-medium text-sm">Sarah Johnson</p>
                          <p className="text-xs text-muted-foreground">Head of Talent, TechCorp</p>
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
                        "The AI matching is incredibly accurate. We've reduced our cost-per-hire by 40% and our new hires are staying longer because they have a better understanding of our company culture from day one."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-r from-brand-blue to-brand-purple rounded-full flex items-center justify-center">
                          <span className="text-white font-semibold text-sm">MR</span>
                        </div>
                        <div>
                          <p className="font-medium text-sm">Michael Rodriguez</p>
                          <p className="text-xs text-muted-foreground">VP People, Growth Dynamics</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Final CTA */}
              <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
                <h3 className="text-2xl font-bold mb-4">Ready to Transform Your Hiring?</h3>
                <p className="text-muted-foreground mb-6">
                  Join hundreds of companies already using MyVideoResume to hire better, faster, and more cost-effectively.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
                      Start Free 14-Day Trial
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Button size="lg" variant="outline">
                    Schedule a Demo
                  </Button>
                </div>
              </div>
            </div>
            <Footer />
          </div>
        </div>
      </div>
    );
  }

  // If user is authenticated, show the actual companies page (placeholder for now)
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
            <h1 className="text-3xl font-bold mb-6">Companies</h1>
            <p className="text-muted-foreground mb-8">Explore companies and their open positions.</p>
            
            <Card>
              <CardContent className="p-8 text-center">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Company directory coming soon</h3>
                <p className="text-muted-foreground mb-4">Discover amazing companies and their cultures</p>
                <Button>Follow Companies</Button>
              </CardContent>
            </Card>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
