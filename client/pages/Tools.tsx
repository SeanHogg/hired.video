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
  Heart,
  ExternalLink,
  Chrome,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSEO } from "@/lib/seo";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";

export default function Tools() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated, user } = useAuth();

  // SEO for tools page
  useSEO(location.pathname);

  // If user is not authenticated, show marketing page
  if (!isAuthenticated || !user) {
    return (
      <>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={sidebarCollapsed}
        />
        <div className={`min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5 ${sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}`}>
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
                  Access cutting-edge AI tools designed to optimize your resume,
                  practice interviews, calculate salary expectations, and
                  accelerate your career growth.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                    >
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
                  <div className="text-3xl font-bold text-primary mb-2">
                    9+
                  </div>
                  <p className="text-sm text-muted-foreground">
                    AI-powered tools
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    1M+
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Resumes analyzed
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    95%
                  </div>
                  <p className="text-sm text-muted-foreground">Accuracy rate</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    24/7
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Tool availability
                  </p>
                </div>
              </div>

              {/* Unified Tools Grid */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  AI-Powered Career Tools
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                  <Link to="/Tools/ResumeOptimizer">
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                              <Zap className="h-6 w-6 text-brand-blue group-hover:scale-110 transition-transform" />
                            </div>
                            <div>
                              <CardTitle className="text-xl">
                                Resume Optimizer
                              </CardTitle>
                              <CardDescription>
                                AI analyzes and improves your resume for maximum impact
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            Available
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">
                                85%
                              </div>
                              <div className="text-muted-foreground">
                                ATS Pass Rate
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-blue-600">
                                50+
                              </div>
                              <div className="text-muted-foreground">
                                Improvements
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ATS optimization
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Keyword suggestions
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Industry benchmarking
                            </div>
                          </div>
                          <Button className="w-full mt-4" variant="outline">
                            Optimize Resume
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>

                  <Link to="/chat">
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                              <MessageSquare className="h-6 w-6 text-brand-blue group-hover:scale-110 transition-transform" />
                            </div>
                            <div>
                              <CardTitle className="text-xl">
                                Interview Coach
                              </CardTitle>
                              <CardDescription>
                                Practice interviews with AI Chat
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                            Available in AI Chat
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">
                                100+
                              </div>
                              <div className="text-muted-foreground">
                                Questions
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-blue-600">
                                Real-time
                              </div>
                              <div className="text-muted-foreground">
                                Feedback
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Role-specific questions
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Real-time feedback
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Confidence scoring
                            </div>
                          </div>
                          <Button className="w-full mt-4" variant="outline">
                            Start AI Chat
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>



                  <Link to="/Tools/SalaryCalculator">
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                              <Calculator className="h-6 w-6 text-brand-green group-hover:scale-110 transition-transform" />
                            </div>
                            <div>
                              <CardTitle className="text-xl">
                                Salary Calculator
                              </CardTitle>
                              <CardDescription>
                                Know your worth with market data insights
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            Available
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">
                                $120K
                              </div>
                              <div className="text-muted-foreground">
                                Avg. Salary
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">
                                25%
                              </div>
                              <div className="text-muted-foreground">
                                Negotiation Boost
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Market rate analysis
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Location adjustments
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Negotiation tips
                            </div>
                          </div>
                          <Button className="w-full mt-4" variant="outline">
                            Calculate Salary
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>

                  <Link to="/Tools/JobResumeMatch">
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                              <Target className="h-6 w-6 text-green-600 group-hover:scale-110 transition-transform" />
                            </div>
                            <div>
                              <CardTitle className="text-xl">
                                Job-Resume Match
                              </CardTitle>
                              <CardDescription>
                                Find perfect job matches based on your profile
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            Available
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">
                                95%
                              </div>
                              <div className="text-muted-foreground">
                                Match Score
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">
                                AI
                              </div>
                              <div className="text-muted-foreground">
                                Powered
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Skills alignment
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Culture fit scoring
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Growth potential
                            </div>
                          </div>
                          <Button className="w-full mt-4" variant="outline">
                            Match Jobs
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>

                  <Link to="/Tools/AIResumeScorer">
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                              <Brain className="h-6 w-6 text-brand-purple group-hover:scale-110 transition-transform" />
                            </div>
                            <div>
                              <CardTitle className="text-xl">
                                AI Resume Scorer
                              </CardTitle>
                              <CardDescription>
                                Get instant feedback on your resume's effectiveness
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                            Hot
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-purple-600">
                                A+
                              </div>
                              <div className="text-muted-foreground">
                                Grade Score
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-purple-600">
                                6
                              </div>
                              <div className="text-muted-foreground">
                                Categories
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Overall scoring
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Category breakdown
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Detailed recommendations
                            </div>
                          </div>
                          <Button className="w-full mt-4" variant="outline">
                            Score My Resume
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>

                  <Link to="/Tools/SummarizeResume">
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                              <FileText className="h-6 w-6 text-brand-orange group-hover:scale-110 transition-transform" />
                            </div>
                            <div>
                              <CardTitle className="text-xl">
                                Resume Summarization
                              </CardTitle>
                              <CardDescription>
                                Generate compelling summaries instantly
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            Available
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-orange-600">
                                3s
                              </div>
                              <div className="text-muted-foreground">
                                Generation
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-orange-600">
                                AI
                              </div>
                              <div className="text-muted-foreground">
                                Powered
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Professional summaries
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Key highlights
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Multiple formats
                            </div>
                          </div>
                          <Button className="w-full mt-4" variant="outline">
                            Summarize Resume
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>

                  {/* Sentiment Analysis */}
                  <Link to="/Tools/SentimentAnalysis">
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
                              <Heart className="h-6 w-6 text-pink-600 group-hover:scale-110 transition-transform" />
                            </div>
                            <div>
                              <CardTitle className="text-xl">
                                Sentiment Analysis
                              </CardTitle>
                              <CardDescription>
                                Analyze your resume's emotional appeal
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            Available
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">
                                40%
                              </div>
                              <div className="text-muted-foreground">
                                More Interviews
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-pink-600">
                                0-100
                              </div>
                              <div className="text-muted-foreground">
                                Score Range
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              AI-powered tone analysis
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Instant positivity scoring
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Personalized recommendations
                            </div>
                          </div>
                          <Button className="w-full mt-4" variant="outline">
                            Analyze My Resume
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>

                  {/* Document Converter */}
                  <Link to="/Tools/pdftojson">
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                              <FileText className="h-6 w-6 text-brand-orange group-hover:scale-110 transition-transform" />
                            </div>
                            <div>
                              <CardTitle className="text-xl">
                                Document Converter
                              </CardTitle>
                              <CardDescription>
                                Convert PDF/Word resumes to JSON
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                            Beta
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-orange-600">
                                PDF
                              </div>
                              <div className="text-muted-foreground">
                                Support
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-orange-600">
                                JSON
                              </div>
                              <div className="text-muted-foreground">
                                Output
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              PDF/Word parsing
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Structured JSON output
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Data extraction
                            </div>
                          </div>
                          <Button className="w-full mt-4" variant="outline">
                            Convert Document
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>

                  {/* Best Resume Generator - Chrome Extension */}
                  <a href="https://myvideoresu.me/insights/how-to-use-job-seeker-chrome-plugin-extension" target="_blank" rel="noopener noreferrer">
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                              <Chrome className="h-6 w-6 text-blue-600 group-hover:scale-110 transition-transform" />
                            </div>
                            <div>
                              <CardTitle className="text-xl">
                                Best Resume Generator
                              </CardTitle>
                              <CardDescription>
                                Chrome extension for job-specific resumes
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                            Chrome Extension
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-blue-600">
                                1-Click
                              </div>
                              <div className="text-muted-foreground">
                                Generation
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-blue-600">
                                Job
                              </div>
                              <div className="text-muted-foreground">
                                Specific
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Job-specific optimization
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Browser integration
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              Instant generation
                            </div>
                          </div>
                          <Button className="w-full mt-4" variant="outline">
                            Install Extension
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                </div>
              </div>


                </div>
              </div>

              {/* How It Works */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  How Our AI Tools Work
                </h2>
                <div className="grid md:grid-cols-4 gap-8">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">1. Upload Content</h3>
                    <p className="text-sm text-muted-foreground">
                      Upload your resume, job description, or input
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Brain className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">2. AI Analysis</h3>
                    <p className="text-sm text-muted-foreground">
                      Our AI processes and analyzes your content
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <BarChart3 className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">3. Get Insights</h3>
                    <p className="text-sm text-muted-foreground">
                      Receive detailed feedback and recommendations
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <TrendingUp className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">4. Improve & Succeed</h3>
                    <p className="text-sm text-muted-foreground">
                      Apply insights to enhance your career
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature Spotlight - Sentiment Analysis */}
              <div className="mb-16">
                <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-2xl p-8 border border-pink-100">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Heart className="h-8 w-8 text-pink-600" />
                    </div>
                    <h2 className="text-3xl font-bold mb-4">
                      New: Resume Sentiment Analysis
                    </h2>
                    <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                      Discover how positive your resume sounds to employers with our AI-powered sentiment analysis tool
                    </p>
                  </div>

                  <div className="grid md:grid-cols-3 gap-6 mb-8">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-pink-600 mb-2">85%</div>
                      <p className="text-sm text-muted-foreground">Analysis Accuracy</p>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600 mb-2">40%</div>
                      <p className="text-sm text-muted-foreground">More Interview Invites</p>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-600 mb-2">0-100</div>
                      <p className="text-sm text-muted-foreground">Sentiment Score Range</p>
                    </div>
                  </div>

                  <div className="text-center">
                    <Link to="/Tools/SentimentAnalysis">
                      <Button size="lg" className="bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90">
                        <Heart className="mr-2 h-5 w-5" />
                        Try Sentiment Analysis Free
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Success Stories */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  Tool Success Stories
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className="h-4 w-4 fill-yellow-400 text-yellow-400"
                          />
                        ))}
                      </div>
                      <p className="text-sm mb-4">
                        "The Resume Optimizer helped me increase my callback
                        rate by 300%. The AI suggestions were spot-on and helped
                        me tailor my resume for each application."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                        <div>
                          <p className="font-medium text-sm">Jennifer Liu</p>
                          <p className="text-xs text-muted-foreground">
                            Data Analyst
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className="h-4 w-4 fill-yellow-400 text-yellow-400"
                          />
                        ))}
                      </div>
                      <p className="text-sm mb-4">
                        "The Interview Simulator gave me the confidence I
                        needed. I practiced for weeks and nailed my dream job
                        interview. The feedback was incredibly detailed."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-blue to-brand-purple rounded-full" />
                        <div>
                          <p className="font-medium text-sm">Carlos Martinez</p>
                          <p className="text-xs text-muted-foreground">
                            Software Engineer
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className="h-4 w-4 fill-yellow-400 text-yellow-400"
                          />
                        ))}
                      </div>
                      <p className="text-sm mb-4">
                        "I never realized my resume sounded so negative! The sentiment analysis
                        showed me exactly what to change. After improving my score from 35 to 78,
                        I started getting way more interview calls."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full" />
                        <div>
                          <p className="font-medium text-sm">Sarah Chen</p>
                          <p className="text-xs text-muted-foreground">
                            Marketing Manager
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Final CTA */}
              <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
                <h3 className="text-2xl font-bold mb-4">
                  Ready to Enhance Your Career?
                </h3>
                <p className="text-muted-foreground mb-6">
                  Access our AI-powered tools and take your career to the next level.
                  More tools coming soon!
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                    >
                      Get Started Today
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/Tools/SentimentAnalysis">
                    <Button size="lg" variant="outline">
                      Try Sentiment Analysis
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
            <Footer />
          </div>
        </div>
      </>
    );
  }

  // If user is authenticated, show the actual tools page
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
            <h1 className="text-3xl font-bold mb-6">AI-Powered Career Tools</h1>
            <p className="text-muted-foreground mb-8">
              Access powerful AI tools to enhance your career and optimize your job search.
            </p>

            {/* Unified Tools Grid */}
            <div className="mb-12">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">

                {/* Resume Optimizer */}
                <Link to="/Tools/ResumeOptimizer">
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Zap className="h-6 w-6 text-brand-blue group-hover:scale-110 transition-transform" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">
                              Resume Optimizer
                            </CardTitle>
                            <CardDescription>
                              AI analyzes and improves your resume for maximum impact
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          Available
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">
                              85%
                            </div>
                            <div className="text-muted-foreground">
                              ATS Pass Rate
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">
                              50+
                            </div>
                            <div className="text-muted-foreground">
                              Improvements
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ATS optimization
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Keyword suggestions
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Industry benchmarking
                          </div>
                        </div>
                        <Button className="w-full mt-4" variant="outline">
                          Optimize Resume
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                {/* Interview Coach */}
                <Link to="/chat">
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <MessageSquare className="h-6 w-6 text-brand-blue group-hover:scale-110 transition-transform" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">
                              Interview Coach
                            </CardTitle>
                            <CardDescription>
                              Practice interviews with AI Chat
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          Available in AI Chat
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">
                              100+
                            </div>
                            <div className="text-muted-foreground">
                              Questions
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">
                              Real-time
                            </div>
                            <div className="text-muted-foreground">
                              Feedback
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Role-specific questions
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Real-time feedback
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Confidence scoring
                          </div>
                        </div>
                        <Button className="w-full mt-4" variant="outline">
                          Start AI Chat
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                {/* Salary Calculator */}
                <Link to="/Tools/SalaryCalculator">
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <Calculator className="h-6 w-6 text-brand-green group-hover:scale-110 transition-transform" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">
                              Salary Calculator
                            </CardTitle>
                            <CardDescription>
                              Know your worth with market data insights
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          Available
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">
                              $120K
                            </div>
                            <div className="text-muted-foreground">
                              Avg. Salary
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">
                              25%
                            </div>
                            <div className="text-muted-foreground">
                              Negotiation Boost
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Market rate analysis
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Location adjustments
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Negotiation tips
                          </div>
                        </div>
                        <Button className="w-full mt-4" variant="outline">
                          Calculate Salary
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                {/* Job-Resume Match */}
                <Link to="/Tools/JobResumeMatch">
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <Target className="h-6 w-6 text-green-600 group-hover:scale-110 transition-transform" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">
                              Job-Resume Match
                            </CardTitle>
                            <CardDescription>
                              Find perfect job matches based on your profile
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          Available
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">
                              95%
                            </div>
                            <div className="text-muted-foreground">
                              Match Score
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">
                              AI
                            </div>
                            <div className="text-muted-foreground">
                              Powered
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Skills alignment
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Culture fit scoring
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Growth potential
                          </div>
                        </div>
                        <Button className="w-full mt-4" variant="outline">
                          Match Jobs
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                {/* AI Resume Scorer */}
                <Link to="/Tools/AIResumeScorer">
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                            <Brain className="h-6 w-6 text-brand-purple group-hover:scale-110 transition-transform" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">
                              AI Resume Scorer
                            </CardTitle>
                            <CardDescription>
                              Get instant feedback on your resume's effectiveness
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                          Hot
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-purple-600">
                              A+
                            </div>
                            <div className="text-muted-foreground">
                              Grade Score
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-purple-600">
                              6
                            </div>
                            <div className="text-muted-foreground">
                              Categories
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Overall scoring
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Category breakdown
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Detailed recommendations
                          </div>
                        </div>
                        <Button className="w-full mt-4" variant="outline">
                          Score My Resume
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                {/* Resume Summarization */}
                <Link to="/Tools/SummarizeResume">
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                            <FileText className="h-6 w-6 text-brand-orange group-hover:scale-110 transition-transform" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">
                              Resume Summarization
                            </CardTitle>
                            <CardDescription>
                              Generate compelling summaries instantly
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          Available
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-orange-600">
                              3s
                            </div>
                            <div className="text-muted-foreground">
                              Generation
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-orange-600">
                              AI
                            </div>
                            <div className="text-muted-foreground">
                              Powered
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Professional summaries
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Key highlights
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Multiple formats
                          </div>
                        </div>
                        <Button className="w-full mt-4" variant="outline">
                          Summarize Resume
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                {/* Best Resume Generator - Chrome Extension */}
                <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                  <CardContent className="p-6 text-center">
                    <Sparkles className="h-8 w-8 mx-auto text-brand-purple mb-4 group-hover:scale-110 transition-transform" />
                    <h3 className="font-semibold mb-2">Best Resume Generator</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Generate tailored resumes for specific jobs
                    </p>
                    <Badge variant="secondary" className="bg-purple-100 text-purple-800 mb-3">
                      Chrome Extension
                    </Badge>
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <a href="https://myvideoresu.me/insights/how-to-use-job-seeker-chrome-plugin-extension" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Get Extension
                      </a>
                    </Button>
                  </CardContent>
                </Card>

                {/* PDF/Word to JSON - Backend Ready */}
                <Link to="/Tools/pdftojson">
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardContent className="p-6 text-center">
                      <FileText className="h-8 w-8 mx-auto text-brand-orange mb-4 group-hover:scale-110 transition-transform" />
                      <h3 className="font-semibold mb-2">Document Converter</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Convert PDF/Word resumes to JSON
                      </p>
                      <Badge variant="secondary" className="bg-orange-100 text-orange-800 mb-3">
                        Beta
                      </Badge>
                      <Button variant="outline" size="sm" className="w-full">
                        Convert Document
                      </Button>
                    </CardContent>
                  </Card>
                </Link>

                {/* Resume Optimizer - Now Available */}
                <Link to="/Tools/ResumeOptimizer">
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardContent className="p-6 text-center">
                      <Zap className="h-8 w-8 mx-auto text-brand-blue mb-4 group-hover:scale-110 transition-transform" />
                      <h3 className="font-semibold mb-2">Resume Optimizer</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Optimize your resume for ATS systems
                      </p>
                      <Badge variant="secondary" className="bg-green-100 text-green-800 mb-3">
                        Available
                      </Badge>
                      <Button variant="outline" size="sm" className="w-full">
                        Optimize Resume
                      </Button>
                    </CardContent>
                  </Card>
                </Link>

                {/* Salary Calculator - Now Available */}
                <Link to="/Tools/SalaryCalculator">
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardContent className="p-6 text-center">
                      <Calculator className="h-8 w-8 mx-auto text-brand-green mb-4 group-hover:scale-110 transition-transform" />
                      <h3 className="font-semibold mb-2">Salary Calculator</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Know your market value
                      </p>
                      <Badge variant="secondary" className="bg-green-100 text-green-800 mb-3">
                        Available
                      </Badge>
                      <Button variant="outline" size="sm" className="w-full">
                        Calculate Salary
                      </Button>
                    </CardContent>
                  </Card>
                </Link>

                {/* AI Resume Scorer - Now Available */}
                <Link to="/Tools/AIResumeScorer">
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardContent className="p-6 text-center">
                      <Brain className="h-8 w-8 mx-auto text-brand-purple mb-4 group-hover:scale-110 transition-transform" />
                      <h3 className="font-semibold mb-2">AI Resume Scorer</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Get instant feedback on your resume
                      </p>
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 mb-3">
                        Hot
                      </Badge>
                      <Button variant="outline" size="sm" className="w-full">
                        Score My Resume
                      </Button>
                    </CardContent>
                  </Card>
                </Link>

                {/* Interview Coach - Available through AI Chat */}
                <Link to="/chat">
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardContent className="p-6 text-center">
                      <MessageSquare className="h-8 w-8 mx-auto text-brand-blue mb-4 group-hover:scale-110 transition-transform" />
                      <h3 className="font-semibold mb-2">Interview Coach</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Practice interviews with AI Chat
                      </p>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800 mb-3">
                        Available in AI Chat
                      </Badge>
                      <Button variant="outline" size="sm" className="w-full">
                        Start AI Chat
                      </Button>
                    </CardContent>
                  </Card>
                </Link>

                {/* Sentiment Analysis */}
                <Link to="/Tools/SentimentAnalysis">
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
                            <Heart className="h-6 w-6 text-pink-600 group-hover:scale-110 transition-transform" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">
                              Sentiment Analysis
                            </CardTitle>
                            <CardDescription>
                              Analyze your resume's emotional appeal
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          Available
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">
                              40%
                            </div>
                            <div className="text-muted-foreground">
                              More Interviews
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-pink-600">
                              0-100
                            </div>
                            <div className="text-muted-foreground">
                              Score Range
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            AI-powered tone analysis
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Instant positivity scoring
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Personalized recommendations
                          </div>
                        </div>
                        <Button className="w-full mt-4" variant="outline">
                          Analyze My Resume
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                {/* Document Converter */}
                <Link to="/Tools/pdftojson">
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                            <FileText className="h-6 w-6 text-brand-orange group-hover:scale-110 transition-transform" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">
                              Document Converter
                            </CardTitle>
                            <CardDescription>
                              Convert PDF/Word resumes to JSON
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                          Beta
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-orange-600">
                              PDF
                            </div>
                            <div className="text-muted-foreground">
                              Support
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-orange-600">
                              JSON
                            </div>
                            <div className="text-muted-foreground">
                              Output
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            PDF/Word parsing
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Structured JSON output
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Data extraction
                          </div>
                        </div>
                        <Button className="w-full mt-4" variant="outline">
                          Convert Document
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                {/* Best Resume Generator - Chrome Extension */}
                <a href="https://myvideoresu.me/insights/how-to-use-job-seeker-chrome-plugin-extension" target="_blank" rel="noopener noreferrer">
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Chrome className="h-6 w-6 text-blue-600 group-hover:scale-110 transition-transform" />
                          </div>
                          <div>
                            <CardTitle className="text-xl">
                              Best Resume Generator
                            </CardTitle>
                            <CardDescription>
                              Chrome extension for job-specific resumes
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          Chrome Extension
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">
                              1-Click
                            </div>
                            <div className="text-muted-foreground">
                              Generation
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">
                              Job
                            </div>
                            <div className="text-muted-foreground">
                              Specific
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Job-specific optimization
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Browser integration
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Instant generation
                          </div>
                        </div>
                        <Button className="w-full mt-4" variant="outline">
                          Install Extension
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </a>
              </div>
            </div>


          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
