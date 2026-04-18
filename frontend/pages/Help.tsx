import {
  HelpCircle,
  Search,
  MessageCircle,
  Mail,
  Phone,
  Video,
  Users,
  Briefcase,
  Zap,
  BookOpen,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { useAI } from "@/lib/ai-context";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";

import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";

export default function Help() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const location = useLocation();
  useSEO(location.pathname);
  useBreadcrumbs([{ name: "Help & Support", url: "/help" }]);
  const { user, isAuthenticated } = useAuth();
  const { openAIChat } = useAI();
  const [searchQuery, setSearchQuery] = useState("");

  const faqs = [
    {
      category: "Getting Started",
      questions: [
        {
          question: "How do I create my first video resume?",
          answer:
            "To create your video resume, go to the Resumes section and click 'Create Video Resume'. You can either upload your own video or use our AI-powered video generation tool to create one from your existing resume.",
        },
        {
          question: "What file formats are supported for uploads?",
          answer:
            "We support common video formats (MP4, MOV, AVI) for video uploads and PDF, DOC, DOCX for text resumes. Maximum file size is 100MB for videos and 10MB for documents.",
        },
        {
          question: "How do I set up my profile?",
          answer:
            "After signing up, you'll be guided through our onboarding process. Complete your profile by adding your personal information, work experience, skills, and upload your resume or create a video resume.",
        },
      ],
    },
    {
      category: "Account & Settings",
      questions: [
        {
          question: "How do I change my password?",
          answer:
            "Go to Settings > Account and click 'Change Password'. You'll need to enter your current password and choose a new one.",
        },
        {
          question: "Can I change my persona type after registration?",
          answer:
            "Yes, you can update your role (Job Seeker, Recruiter, Employer) in your Profile settings. Note that this will change your dashboard and available features.",
        },
        {
          question: "How do I delete my account?",
          answer:
            "Account deletion can be done from Settings > Account > Delete Account. This action is permanent and cannot be undone.",
        },
      ],
    },
    {
      category: "Video Resumes",
      questions: [
        {
          question: "What makes a good video resume?",
          answer:
            "A good video resume should be 1-3 minutes long, professionally presented, highlight your key skills and experience, and include a clear call to action. Use good lighting and audio quality.",
        },
        {
          question: "Can I edit my video resume after uploading?",
          answer:
            "Yes, you can edit the title, description, and tags of your video resume. To change the video content itself, you'll need to upload a new version.",
        },
        {
          question: "How do I make my video resume private?",
          answer:
            "In your video resume settings, you can change the visibility to 'Private', 'Unlisted', or 'Public'. Private videos are only visible to you.",
        },
      ],
    },
    {
      category: "Job Search",
      questions: [
        {
          question: "How does job matching work?",
          answer:
            "Our AI analyzes your profile, skills, and preferences to match you with relevant job opportunities. You can refine matches by updating your preferences in Settings.",
        },
        {
          question: "Can I track my job applications?",
          answer:
            "Yes, the Jobs section includes an application tracker where you can monitor the status of all your applications and set follow-up reminders.",
        },
        {
          question: "How do I get notified about new job matches?",
          answer:
            "Enable job notifications in Settings > Notifications. You can choose to receive alerts via email or push notifications.",
        },
      ],
    },
    {
      category: "For Recruiters",
      questions: [
        {
          question: "How do I post a job opening?",
          answer:
            "Go to the Jobs section and click 'Post New Job'. Fill in the job details, requirements, and company information. Your posting will be visible to matching candidates.",
        },
        {
          question: "Can I search for candidates by specific criteria?",
          answer:
            "Yes, use the People section to search and filter candidates by skills, experience level, location, and other criteria. You can save searches for future use.",
        },
        {
          question: "How do I manage my candidate pipeline?",
          answer:
            "The Dashboard provides a pipeline view where you can track candidates through different stages of your hiring process, from initial contact to hiring.",
        },
      ],
    },
  ];

  // Inject FAQPage JSON-LD for all visible Q&As
  const faqSchema = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.flatMap((cat) =>
      cat.questions.map((q) => ({
        "@type": "Question",
        name: q.question,
        acceptedAnswer: { "@type": "Answer", text: q.answer },
      })),
    ),
  }), []);

  useEffect(() => {
    const scriptId = "help-faq-jsonld";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = scriptId;
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(faqSchema);
    return () => { document.getElementById(scriptId)?.remove(); };
  }, [faqSchema]);

  const contactOptions = [
    {
      icon: MessageCircle,
      title: "Live Chat",
      description: "Chat with our support team",
      action: "Start Chat",
      available: "Mon-Fri, 9AM-6PM PST",
      onClick: () => openAIChat(),
    },
    {
      icon: Mail,
      title: "Email Support",
      description: "Send us an email",
      action: "Send Email",
      available: "help@hired.video",
      href: "mailto:help@hired.video",
    },
    {
      icon: Phone,
      title: "Phone Support",
      description: "Call our support line",
      action: "Call Now",
      available: "+1 (555) 123-4567",
      href: "tel:+15551234567",
    },
  ];

  const resources = [
    {
      icon: BookOpen,
      title: "Getting Started Guide",
      description:
        "Complete guide to setting up your profile and creating your first video resume",
      link: "/guides/getting-started",
    },
    {
      icon: Video,
      title: "Video Resume Best Practices",
      description:
        "Tips and tricks for creating compelling video resumes that get results",
      link: "/guides/video-best-practices",
    },
    {
      icon: Users,
      title: "Networking Tips",
      description:
        "How to build professional connections and leverage your network",
      link: "/guides/networking",
    },
    {
      icon: Briefcase,
      title: "Job Search Strategies",
      description: "Proven strategies for finding and landing your dream job",
      link: "/guides/job-search",
    },
  ];

  const filteredFaqs = faqs
    .map((category) => ({
      ...category,
      questions: category.questions.filter(
        (q) =>
          searchQuery === "" ||
          q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          q.answer.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    }))
    .filter((category) => category.questions.length > 0);

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
          <div className="max-w-6xl mx-auto space-y-8">
            {/* Header */}
            <div className="text-center">
              <div className="inline-flex items-center space-x-2 mb-4">
                <HelpCircle className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  Help & Support
                </span>
              </div>
              <h1 className="text-4xl font-bold mb-4">How can we help you?</h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Find answers to common questions, browse our guides, or get in
                touch with our support team.
              </p>
            </div>

            {/* Search */}
            <div className="max-w-2xl mx-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
                <Input
                  placeholder="Search for help topics, features, or questions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 text-lg"
                />
              </div>
            </div>

            {/* Main Content */}
            <Tabs defaultValue="faq" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto">
                <TabsTrigger value="faq">FAQ</TabsTrigger>
                <TabsTrigger value="guides">Guides</TabsTrigger>
                <TabsTrigger value="contact">Contact</TabsTrigger>
              </TabsList>

              {/* FAQ Tab */}
              <TabsContent value="faq" className="space-y-6">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold mb-2">
                    Frequently Asked Questions
                  </h2>
                  <p className="text-muted-foreground">
                    Quick answers to the most common questions about
                    hired.video
                  </p>
                </div>

                {filteredFaqs.length > 0 ? (
                  <div className="space-y-8">
                    {filteredFaqs.map((category, categoryIndex) => (
                      <Card key={categoryIndex}>
                        <CardHeader>
                          <CardTitle className="text-lg">
                            {category.category}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Accordion
                            type="single"
                            collapsible
                            className="w-full"
                          >
                            {category.questions.map((faq, faqIndex) => (
                              <AccordionItem
                                key={faqIndex}
                                value={`${categoryIndex}-${faqIndex}`}
                              >
                                <AccordionTrigger className="text-left">
                                  {faq.question}
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground">
                                  {faq.answer}
                                </AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">
                      No results found
                    </h3>
                    <p className="text-muted-foreground">
                      Try adjusting your search or browse our guides and contact
                      options.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Guides Tab */}
              <TabsContent value="guides" className="space-y-6">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold mb-2">Helpful Guides</h2>
                  <p className="text-muted-foreground">
                    Comprehensive guides to help you get the most out of
                    hired.video
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {resources.map((resource, index) => (
                    <Card
                      key={index}
                      className="hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <CardHeader>
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                            <resource.icon className="h-6 w-6 text-primary" />
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-lg mb-2">
                              {resource.title}
                            </CardTitle>
                            <CardDescription>
                              {resource.description}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Button variant="outline" className="w-full gap-2" asChild>
                          <Link to={resource.link}>
                            Read Guide
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Additional Resources */}
                <Card>
                  <CardHeader>
                    <CardTitle>Video Tutorials</CardTitle>
                    <CardDescription>
                      Watch step-by-step video tutorials to master hired.video
                      features
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="gap-2" asChild>
                      <Link to="/guides/tutorials">
                        <Video className="h-4 w-4" />
                        Watch Tutorials
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Contact Tab */}
              <TabsContent value="contact" className="space-y-6">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold mb-2">Get in Touch</h2>
                  <p className="text-muted-foreground">
                    Need personalized help? Our support team is here to assist
                    you
                  </p>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                  {contactOptions.map((option, index) => (
                    <Card key={index} className="text-center">
                      <CardHeader>
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                          <option.icon className="h-8 w-8 text-primary" />
                        </div>
                        <CardTitle>{option.title}</CardTitle>
                        <CardDescription>{option.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                          {option.available}
                        </p>
                        {option.href ? (
                          <Button className="w-full" asChild>
                            <a href={option.href}>{option.action}</a>
                          </Button>
                        ) : (
                          <Button className="w-full" onClick={option.onClick}>
                            {option.action}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Status & Updates */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5" />
                      System Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full" />
                      <span className="text-sm">All systems operational</span>
                      <Button variant="link" className="ml-auto p-0 h-auto" asChild>
                        <a href="https://status.hired.video" target="_blank" rel="noopener noreferrer">
                          View Status Page
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
