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
import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppShell } from "@/components/AppShell";
import { useLocation } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";

import { useAuth } from "@/lib/auth";
import { HELP_FAQS, HELP_GUIDES } from "@/data/help-faqs";
import { useContactPanel } from "@/components/ContactPanel";

export default function Help() {  const location = useLocation();
  useSEO(location.pathname);
  useBreadcrumbs([{ name: "Help & Support", url: "/help" }]);
  const { user, isAuthenticated } = useAuth();
  const { openAIChat } = useAI();
  const { openContactPanel } = useContactPanel();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") ?? "";

  const faqs = HELP_FAQS;
  void HELP_GUIDES;

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

  // Every contact route on the Help page now flows through one mechanism.
  // Email + the generic support entry open the shared <ContactPanel> so the
  // inquiry lands in marketing_leads + notifies super_admins (no more
  // mailto: silently dropping into the visitor's mail client, which fails
  // on Chromebook / mobile-web where no mail client is registered). Live
  // Chat still opens the AI assistant; phone keeps the tel: deeplink.
  const contactOptions = [
    {
      icon: MessageCircle,
      title: "Live Chat",
      description: "Chat with our AI assistant",
      action: "Start Chat",
      available: "Mon-Fri, 9AM-6PM PST",
      onClick: () => openAIChat(),
    },
    {
      icon: Mail,
      title: "Email Support",
      description: "Send our team a message",
      action: "Send Message",
      available: "Typical response within 24h",
      onClick: () =>
        openContactPanel({
          inquiryType: "support",
          title: "Contact support",
          description:
            "Send our team a message and we'll get back to you within 24 hours.",
        }),
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
    <AppShell bgClassName="bg-background">
<div className="p-6">
          <div className="space-y-8">
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

            {/* Active search query indicator */}
            {searchQuery && (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Showing results for{" "}
                  <span className="font-medium text-foreground">
                    &quot;{searchQuery}&quot;
                  </span>{" "}
                  — use the header search to refine.
                </p>
              </div>
            )}

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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
</AppShell>
  );
}
