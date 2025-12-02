import { useSEO } from "@/lib/seo";
import { useSidebar } from "@/hooks/use-sidebar";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Chrome,
  Sparkles,
  Zap,
  Target,
  FileText,
  CheckCircle2,
  ArrowRight,
  Download,
  MousePointer,
  Briefcase,
  BarChart3,
  Shield,
} from "lucide-react";

const CHROME_STORE_URL =
  "https://chromewebstore.google.com/detail/myvideoresume-job-seeker/ohjmknhokdkgfmgbblflmliefoegciol";

export default function ChromeExtension() {
  useSEO("/chrome-extension");
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />
        <main className="pt-16">
          {/* Hero Section */}
          <section className="bg-gradient-to-br from-blue-50 via-white to-purple-50 py-16 px-6">
            <div className="max-w-6xl mx-auto text-center">
              <Badge className="mb-4 bg-blue-100 text-blue-800 hover:bg-blue-100">
                <Chrome className="h-4 w-4 mr-1" /> Chrome Extension
              </Badge>
              <h1 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Generate Job-Specific Resumes in One Click
              </h1>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
                Our Chrome extension lets you create perfectly tailored resumes directly from any job posting. 
                No more copy-pasting or manual adjustments.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                    <Download className="h-5 w-5 mr-2" />
                    Install Free Extension
                  </Button>
                </a>
                <Button size="lg" variant="outline">
                  <Sparkles className="h-5 w-5 mr-2" />
                  Watch Demo
                </Button>
              </div>
            </div>
          </section>

          {/* Key Features */}
          <section className="py-16 px-6">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-12">Key Features</h2>
              <div className="grid md:grid-cols-3 gap-8">
                <Card className="border-blue-200 hover:border-blue-400 transition-colors">
                  <CardHeader>
                    <MousePointer className="h-10 w-10 text-blue-600 mb-4" />
                    <CardTitle>One-Click Generation</CardTitle>
                    <CardDescription>
                      Click the extension icon on any job page and get a tailored resume instantly
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-purple-200 hover:border-purple-400 transition-colors">
                  <CardHeader>
                    <Target className="h-10 w-10 text-purple-600 mb-4" />
                    <CardTitle>Job-Specific Optimization</CardTitle>
                    <CardDescription>
                      AI extracts key requirements and optimizes your resume to match perfectly
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-green-200 hover:border-green-400 transition-colors">
                  <CardHeader>
                    <Zap className="h-10 w-10 text-green-600 mb-4" />
                    <CardTitle>Works Everywhere</CardTitle>
                    <CardDescription>
                      LinkedIn, Indeed, Glassdoor, company career pages, and any job board
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section className="py-16 px-6 bg-gray-50">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
              <div className="grid md:grid-cols-4 gap-6">
                {[
                  { step: 1, icon: Download, title: "Install Extension", desc: "Add to Chrome in one click" },
                  { step: 2, icon: Briefcase, title: "Browse Jobs", desc: "Find jobs on any site" },
                  { step: 3, icon: MousePointer, title: "Click Extension", desc: "Generate tailored resume" },
                  { step: 4, icon: FileText, title: "Apply & Win", desc: "Download and submit" },
                ].map(({ step, icon: Icon, title, desc }) => (
                  <div key={step} className="text-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Icon className="h-8 w-8 text-blue-600" />
                    </div>
                    <Badge className="mb-2">Step {step}</Badge>
                    <h3 className="font-semibold mb-1">{title}</h3>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Benefits */}
          <section className="py-16 px-6">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-12">Why Use Our Extension?</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {[
                  { icon: BarChart3, title: "Higher Match Scores", desc: "AI-optimized resumes score 30%+ higher on ATS systems" },
                  { icon: Zap, title: "Save Hours", desc: "Create tailored resumes in seconds instead of hours" },
                  { icon: Target, title: "Beat the Competition", desc: "Stand out with perfectly matched keywords and skills" },
                  { icon: Shield, title: "Secure & Private", desc: "Your data stays in your MyVideoResume account" },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-4 p-4 rounded-lg border hover:bg-gray-50">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                      <Icon className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{title}</h3>
                      <p className="text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Supported Sites */}
          <section className="py-16 px-6 bg-gray-50">
            <div className="max-w-6xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-6">Works on All Major Job Sites</h2>
              <p className="text-muted-foreground mb-8">
                LinkedIn, Indeed, Glassdoor, ZipRecruiter, Dice, SimplyHired, Lever, Greenhouse, and thousands more
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                {["LinkedIn", "Indeed", "Glassdoor", "ZipRecruiter", "Dice", "SimplyHired", "Lever", "Greenhouse"].map((site) => (
                  <Badge key={site} variant="secondary" className="px-4 py-2 text-base">
                    <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                    {site}
                  </Badge>
                ))}
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-16 px-6 bg-gradient-to-r from-blue-600 to-purple-600">
            <div className="max-w-4xl mx-auto text-center text-white">
              <h2 className="text-3xl font-bold mb-4">Ready to Land Your Dream Job?</h2>
              <p className="text-xl mb-8 opacity-90">
                Install the free extension and start creating perfectly tailored resumes today.
              </p>
              <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="secondary" className="text-blue-600">
                  <Chrome className="h-5 w-5 mr-2" />
                  Install Free Extension
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </a>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </div>
  );
}

