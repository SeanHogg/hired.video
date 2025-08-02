import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Navigation from "@/components/Navigation";
import {
  Video,
  Brain,
  FileText,
  Target,
  Users,
  Briefcase,
  ChevronRight,
  Sparkles,
  BarChart3,
  Zap,
  Shield,
  Globe,
  CheckCircle,
  ArrowRight,
  Play,
} from "lucide-react";

export default function Index() {
  const features = [
    {
      icon: Brain,
      title: "AI-Powered Resume Enhancement",
      description: "Sentiment analysis, summarization, and optimization tools powered by advanced AI",
      features: ["Resume optimization", "Sentiment analysis", "Job matching (0-100 score)", "Content summarization"]
    },
    {
      icon: FileText,
      title: "Smart Resume Processing",
      description: "Convert and manage resumes across multiple formats with intelligent parsing",
      features: ["PDF to JSON conversion", "Multi-format support", "Version control", "Resume builder"]
    },
    {
      icon: Target,
      title: "Job Matching & Management",
      description: "Extract, store, and match job postings with AI-powered recommendations",
      features: ["Job extraction", "Smart matching", "Recommendations", "Background processing"]
    },
    {
      icon: BarChart3,
      title: "Productivity Tools",
      description: "Kanban boards, task management, and project tracking for organized workflows",
      features: ["Task management", "Kanban boards", "Appointment scheduling", "Team collaboration"]
    },
    {
      icon: Users,
      title: "Multi-Role Platform",
      description: "Designed for both job seekers and recruiters with role-based access control",
      features: ["Job seeker profiles", "Company profiles", "Role permissions", "Secure authentication"]
    },
    {
      icon: Zap,
      title: "Advanced Features",
      description: "Feature flags, payment integration, analytics, and export capabilities",
      features: ["A/B testing", "Stripe payments", "Data analytics", "CSV exports"]
    }
  ];

  const targetUsers = [
    {
      icon: Briefcase,
      title: "Job Seekers",
      description: "Enhance your resume with AI-powered tools and find better job matches",
      benefits: [
        "AI resume optimization",
        "Video resume creation",
        "Job match scoring",
        "Interview preparation"
      ]
    },
    {
      icon: Users,
      title: "Recruiters",
      description: "Streamline your hiring process with intelligent candidate matching",
      benefits: [
        "Smart candidate filtering",
        "Resume parsing tools",
        "Automated job posting",
        "Applicant tracking"
      ]
    },
    {
      icon: Globe,
      title: "Companies",
      description: "Manage your entire hiring pipeline with comprehensive tools",
      benefits: [
        "Team collaboration",
        "Custom workflows",
        "Analytics dashboard",
        "Brand management"
      ]
    }
  ];

  const stats = [
    { number: "95%", label: "Match Accuracy" },
    { number: "50%", label: "Faster Hiring" },
    { number: "10k+", label: "Resumes Processed" },
    { number: "500+", label: "Companies" }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      {/* Hero Section */}
      <section className="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <Badge variant="secondary" className="mb-6 px-4 py-2 text-sm font-medium bg-brand-purple-light text-brand-purple-dark">
              <Sparkles className="w-4 h-4 mr-2" />
              AI-Powered Resume Platform
            </Badge>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
              Transform Your Resume with{" "}
              <span className="bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                AI-Powered
              </span>{" "}
              Video Enhancement
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
              MyVideoResume enhances traditional resumes with multimedia content and provides AI-powered tools 
              for job seekers and recruiters. Create stunning video resumes, get AI-powered job matching, 
              and streamline your hiring process.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              <Link to="/signup">
                <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 transition-opacity text-lg px-8 py-3">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/demo">
                <Button size="lg" variant="outline" className="text-lg px-8 py-3">
                  <Play className="mr-2 h-5 w-5" />
                  Watch Demo
                </Button>
              </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-16">
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-3xl font-bold text-foreground mb-2">{stat.number}</div>
                  <div className="text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Powerful Features for Modern Hiring
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Everything you need to enhance resumes, match candidates, and streamline your hiring process
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <CardHeader>
                  <div className="w-12 h-12 bg-gradient-to-r from-brand-purple to-brand-blue rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                  <CardDescription className="text-base">{feature.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {feature.features.map((item, idx) => (
                      <li key={idx} className="flex items-center text-sm text-muted-foreground">
                        <CheckCircle className="h-4 w-4 text-brand-purple mr-2 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Target Users Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Built for Everyone in Hiring
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Whether you're a job seeker, recruiter, or company, we have the tools you need
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {targetUsers.map((user, index) => (
              <Card key={index} className="border-2 hover:border-primary/50 transition-colors duration-300 h-full">
                <CardHeader className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full flex items-center justify-center mx-auto mb-4">
                    <user.icon className="h-8 w-8 text-white" />
                  </div>
                  <CardTitle className="text-2xl">{user.title}</CardTitle>
                  <CardDescription className="text-base">{user.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {user.benefits.map((benefit, idx) => (
                      <li key={idx} className="flex items-center">
                        <CheckCircle className="h-5 w-5 text-brand-purple mr-3 flex-shrink-0" />
                        <span className="text-foreground">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    <Link to={`/${user.title.toLowerCase().replace(' ', '-')}`}>
                      <Button variant="outline" className="w-full group">
                        Learn More
                        <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-brand-purple to-brand-blue">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to Transform Your Hiring Process?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Join thousands of job seekers and recruiters who are already using MyVideoResume 
            to create better connections and make smarter hiring decisions.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup">
              <Button size="lg" variant="secondary" className="text-lg px-8 py-3 bg-white text-brand-purple hover:bg-white/90">
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/contact">
              <Button size="lg" variant="outline" className="text-lg px-8 py-3 border-white/30 text-white hover:bg-white/10">
                Contact Sales
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-background border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <Link to="/" className="flex items-center space-x-2 mb-4">
                <div className="relative">
                  <Video className="h-8 w-8 text-primary" />
                  <Sparkles className="h-4 w-4 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  MyVideoResume
                </span>
              </Link>
              <p className="text-muted-foreground max-w-md">
                Enhancing traditional resumes with AI-powered tools and multimedia content 
                for better job matching and hiring decisions.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold text-foreground mb-4">Product</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li><Link to="/features" className="hover:text-foreground transition-colors">Features</Link></li>
                <li><Link to="/pricing" className="hover:text-foreground transition-colors">Pricing</Link></li>
                <li><Link to="/demo" className="hover:text-foreground transition-colors">Demo</Link></li>
                <li><Link to="/api" className="hover:text-foreground transition-colors">API</Link></li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold text-foreground mb-4">Company</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li><Link to="/about" className="hover:text-foreground transition-colors">About</Link></li>
                <li><Link to="/careers" className="hover:text-foreground transition-colors">Careers</Link></li>
                <li><Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link></li>
                <li><Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-border mt-8 pt-8 text-center text-muted-foreground">
            <p>&copy; 2024 MyVideoResume. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
