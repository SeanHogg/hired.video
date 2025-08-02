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
  Wrench,
  Video,
  Sparkles,
  ArrowRight,
  Star,
  Brain,
  FileText,
  BarChart3,
  CheckCircle2,
  Play,
  Target,
  Zap,
  Calculator,
  MessageSquare,
  Mic,
  Search,
  Globe,
  Award,
  TrendingUp,
} from "lucide-react";

export default function Tools() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { isAuthenticated, user } = useAuth();

  // If user is not authenticated, show marketing page
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
                    <Wrench className="h-12 w-12 text-primary" />
                    <Brain className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    AI-Powered Tools
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  Supercharge Your Career with Smart Tools
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  Access cutting-edge AI tools designed to optimize your resume, practice interviews, calculate salary expectations, and accelerate your career growth.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8">
                      Access All Tools
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    <Play className="mr-2 h-5 w-5" />
                    Try Free Tool
                  </Button>
                </div>
              </div>

              {/* Stats Section */}
              <div className="grid md:grid-cols-4 gap-6 mb-16">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">25+</div>
                  <p className="text-sm text-muted-foreground">AI-powered tools</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">1M+</div>
                  <p className="text-sm text-muted-foreground">Resumes analyzed</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">95%</div>
                  <p className="text-sm text-muted-foreground">Accuracy rate</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">24/7</div>
                  <p className="text-sm text-muted-foreground">Tool availability</p>
                </div>
              </div>

              {/* Tools Grid */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">Essential Career Tools</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  
                  <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                    <CardHeader>
                      <FileText className="h-8 w-8 text-brand-purple mb-3" />
                      <CardTitle className="text-lg">Resume Optimizer</CardTitle>
                      <CardDescription className="text-sm">
                        AI analyzes and improves your resume for maximum impact
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ATS optimization
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Keyword suggestions
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Industry benchmarking
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                    <CardHeader>
                      <Mic className="h-8 w-8 text-brand-blue mb-3" />
                      <CardTitle className="text-lg">Interview Simulator</CardTitle>
                      <CardDescription className="text-sm">
                        Practice with AI-powered mock interviews
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Role-specific questions
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Real-time feedback
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Confidence scoring
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                    <CardHeader>
                      <Calculator className="h-8 w-8 text-primary mb-3" />
                      <CardTitle className="text-lg">Salary Calculator</CardTitle>
                      <CardDescription className="text-sm">
                        Know your worth with market data insights
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Market rate analysis
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Location adjustments
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Negotiation tips
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-green-200 hover:border-green-300 transition-colors">
                    <CardHeader>
                      <Target className="h-8 w-8 text-green-600 mb-3" />
                      <CardTitle className="text-lg">Job Matcher</CardTitle>
                      <CardDescription className="text-sm">
                        Find perfect job matches based on your profile
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Skills alignment
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Culture fit scoring
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Growth potential
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-orange-200 hover:border-orange-300 transition-colors">
                    <CardHeader>
                      <BarChart3 className="h-8 w-8 text-orange-600 mb-3" />
                      <CardTitle className="text-lg">Career Analytics</CardTitle>
                      <CardDescription className="text-sm">
                        Track your career progress and growth
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Progress tracking
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Goal setting
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Milestone alerts
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-pink-200 hover:border-pink-300 transition-colors">
                    <CardHeader>
                      <MessageSquare className="h-8 w-8 text-pink-600 mb-3" />
                      <CardTitle className="text-lg">Cover Letter AI</CardTitle>
                      <CardDescription className="text-sm">
                        Generate compelling cover letters instantly
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Job-specific content
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Tone optimization
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Multiple templates
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                </div>
              </div>

              {/* Popular Tools */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">Most Popular Tools</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  
                  <Card className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-brand-purple/10 rounded-lg flex items-center justify-center">
                            <Brain className="h-6 w-6 text-brand-purple" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">AI Resume Scorer</CardTitle>
                            <CardDescription>Get instant feedback on your resume</CardDescription>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Hot</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span>ATS Compatibility</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className="w-4/5 h-full bg-green-500 rounded-full"></div>
                            </div>
                            <span className="text-green-600 font-medium">92%</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Content Quality</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className="w-5/6 h-full bg-blue-500 rounded-full"></div>
                            </div>
                            <span className="text-blue-600 font-medium">88%</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Keywords Score</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className="w-3/4 h-full bg-purple-500 rounded-full"></div>
                            </div>
                            <span className="text-purple-600 font-medium">85%</span>
                          </div>
                        </div>
                        <Button className="w-full mt-4" variant="outline">
                          Try Free Scan
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-brand-blue/10 rounded-lg flex items-center justify-center">
                            <Zap className="h-6 w-6 text-brand-blue" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">Interview Coach</CardTitle>
                            <CardDescription>Practice with AI-powered feedback</CardDescription>
                          </div>
                        </div>
                        <Badge variant="secondary">New</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">94%</div>
                            <div className="text-muted-foreground">Success Rate</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">25min</div>
                            <div className="text-muted-foreground">Avg Session</div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            200+ question database
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Real-time speech analysis
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Personalized improvement tips
                          </div>
                        </div>
                        <Button className="w-full mt-4" variant="outline">
                          Start Practice Session
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                </div>
              </div>

              {/* How It Works */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">How Our AI Tools Work</h2>
                <div className="grid md:grid-cols-4 gap-8">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">1. Upload Content</h3>
                    <p className="text-sm text-muted-foreground">Upload your resume, job description, or input</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Brain className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">2. AI Analysis</h3>
                    <p className="text-sm text-muted-foreground">Our AI processes and analyzes your content</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <BarChart3 className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">3. Get Insights</h3>
                    <p className="text-sm text-muted-foreground">Receive detailed feedback and recommendations</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <TrendingUp className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">4. Improve & Succeed</h3>
                    <p className="text-sm text-muted-foreground">Apply insights to enhance your career</p>
                  </div>
                </div>
              </div>

              {/* Success Stories */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">Tool Success Stories</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                      <p className="text-sm mb-4">
                        "The Resume Optimizer helped me increase my callback rate by 300%. The AI suggestions were spot-on and helped me tailor my resume for each application."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                        <div>
                          <p className="font-medium text-sm">Jennifer Liu</p>
                          <p className="text-xs text-muted-foreground">Data Analyst</p>
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
                        "The Interview Simulator gave me the confidence I needed. I practiced for weeks and nailed my dream job interview. The feedback was incredibly detailed."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-blue to-brand-purple rounded-full" />
                        <div>
                          <p className="font-medium text-sm">Carlos Martinez</p>
                          <p className="text-xs text-muted-foreground">Software Engineer</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Final CTA */}
              <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
                <h3 className="text-2xl font-bold mb-4">Ready to Accelerate Your Career?</h3>
                <p className="text-muted-foreground mb-6">
                  Access all 25+ AI-powered tools and take your career to the next level.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
                      Get Full Tool Access
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Button size="lg" variant="outline">
                    Try Free Tools
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

  // If user is authenticated, show the actual tools page (placeholder for now)
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
            <h1 className="text-3xl font-bold mb-6">AI-Powered Tools</h1>
            <p className="text-muted-foreground mb-8">Access powerful tools to enhance your career.</p>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardContent className="p-6 text-center">
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2">Resume Optimizer</h3>
                  <p className="text-sm text-muted-foreground mb-4">Optimize your resume for ATS</p>
                  <Button variant="outline" size="sm">Use Tool</Button>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6 text-center">
                  <Mic className="h-8 w-8 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2">Interview Coach</h3>
                  <p className="text-sm text-muted-foreground mb-4">Practice interviews with AI</p>
                  <Button variant="outline" size="sm">Start Practice</Button>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-6 text-center">
                  <Calculator className="h-8 w-8 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2">Salary Calculator</h3>
                  <p className="text-sm text-muted-foreground mb-4">Know your market value</p>
                  <Button variant="outline" size="sm">Calculate</Button>
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
