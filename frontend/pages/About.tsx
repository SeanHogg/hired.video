import {
  Video,
  Sparkles,
  ArrowRight,
  Heart,
  Brain,
  Zap,
  Globe,
  Award,
  Shield,
  TrendingUp,
  CheckCircle2,
  Star,
  MessageCircle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSEO } from "@/lib/seo";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import MarketingFAQ from "@/components/MarketingFAQ";
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
import PeopleCard from "@/components/PeopleCard";
import { userService } from "@/lib/services/user-service";
import type { UserMetadata } from "@/types/people";

export default function About() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  // SEO for about page
  useSEO(location.pathname);
  const { isAuthenticated } = useAuth();

  const values = [
    {
      icon: Heart,
      title: "Passion for People",
      description:
        "We believe every professional deserves to showcase their unique talents and find meaningful career opportunities.",
    },
    {
      icon: Brain,
      title: "Innovation First",
      description:
        "We leverage cutting-edge AI and video technology to solve real problems in recruitment and career development.",
    },
    {
      icon: Shield,
      title: "Trust & Privacy",
      description:
        "Your data is sacred. We maintain the highest standards of privacy and security in everything we build.",
    },
    {
      icon: Globe,
      title: "Global Impact",
      description:
        "Our platform connects talent worldwide, breaking down barriers and creating opportunities across borders.",
    },
  ];

  const [teamMembers, setTeamMembers] = useState<UserMetadata[]>([]);

  useEffect(() => {
    userService.getUserBySlug("seanhogg").then((profile) => {
      const member: UserMetadata = {
        id: profile.id || "",
        slug: profile.slug || "seanhogg",
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        fullName: `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
        avatar: profile.profilePicture || undefined,
        headline: profile.currentRole || profile.bio || "",
        location: profile.location || "",
        role: profile.role || "",
        visibility: "public",
        status: "active",
        createdAt: profile.createdAt || new Date().toISOString(),
        updatedAt: profile.updatedAt || new Date().toISOString(),
        lastActiveAt: profile.updatedAt || new Date().toISOString(),
        profileViews: profile.profileViews || 0,
        connectionCount: 0,
        followerCount: 0,
        emailConfirmed: profile.isVerified || false,
        isPremium: profile.isPremium || false,
        openToWork: profile.openToWork || false,
        currentPosition: profile.currentRole || undefined,
        currentCompany: profile.currentCompany || undefined,
      };
      setTeamMembers([member]);
    }).catch(() => {
      // Failed to load team member — render nothing
    });
  }, []);

  const stats = [
    { number: "50K+", label: "Active Users" },
    { number: "1M+", label: "Video Resumes Created" },
    { number: "500+", label: "Companies Hiring" },
    { number: "95%", label: "User Satisfaction" },
  ];

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

        <div className="pt-16">
          {/* Hero Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
            <div className="max-w-6xl mx-auto text-center">
              <div className="inline-flex items-center space-x-2 mb-6">
                <div className="relative">
                  <Video className="h-12 w-12 text-primary" />
                  <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  Hired.video
                </span>
              </div>
              <h1 className="text-5xl md:text-6xl font-bold mb-6">
                Transforming Careers with{" "}
                <span className="bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  AI & Video
                </span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                We're on a mission to revolutionize how people showcase their
                talents and find meaningful work. Through AI-powered video
                resumes and intelligent matching, we're making career success
                accessible to everyone.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    Join Our Mission
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="text-lg px-8">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  Contact Us
                </Button>
              </div>
            </div>
          </section>

          {/* Stats Section */}
          <section className="py-16 px-4 sm:px-6 lg:px-8 border-b border-border">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                {stats.map((stat, index) => (
                  <div key={index} className="text-center">
                    <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                      {stat.number}
                    </div>
                    <div className="text-muted-foreground font-medium">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Mission Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 className="text-3xl md:text-4xl font-bold mb-6">
                    Our Mission
                  </h2>
                  <p className="text-lg text-muted-foreground mb-6">
                    Traditional resumes can't capture the full spectrum of human
                    talent. We believe that everyone deserves to tell their
                    story in a way that showcases their unique personality,
                    skills, and potential.
                  </p>
                  <p className="text-lg text-muted-foreground mb-8">
                    By combining AI technology with video storytelling, we're
                    creating a world where hiring is more human, more fair, and
                    more effective for both candidates and employers.
                  </p>
                  <div className="flex items-center gap-4">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <span className="text-lg font-medium">
                      Making hiring more human
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <span className="text-lg font-medium">
                      Democratizing opportunity
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <span className="text-lg font-medium">
                      Powered by cutting-edge AI
                    </span>
                  </div>
                </div>
                <div className="relative">
                  <div className="w-full h-96 bg-gradient-to-br from-brand-purple/20 to-brand-blue/20 rounded-2xl flex items-center justify-center">
                    <Video className="h-24 w-24 text-primary" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Values Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/20">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Our Values
                </h2>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                  The principles that guide everything we do and every decision
                  we make.
                </p>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                {values.map((value, index) => (
                  <Card key={index} className="text-center">
                    <CardHeader>
                      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <value.icon className="h-8 w-8 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{value.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground text-sm">
                        {value.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* Team Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Meet Our Team
                </h2>
                <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                  Passionate professionals from diverse backgrounds, united by a
                  vision to transform careers.
                </p>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                {teamMembers.map((member) => (
                  <PeopleCard key={member.id} person={member} />
                ))}
              </div>
            </div>
          </section>

          {/* Technology Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/20">
            <div className="max-w-6xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Built with Modern Technology
              </h2>
              <p className="text-xl text-muted-foreground mb-12 max-w-3xl mx-auto">
                Our platform leverages the latest advances in AI, video
                processing, and web technology to deliver a seamless, secure,
                and scalable experience.
              </p>

              <div className="grid md:grid-cols-3 gap-8">
                <Card>
                  <CardHeader>
                    <Brain className="h-12 w-12 text-primary mx-auto mb-4" />
                    <CardTitle>AI-Powered Matching</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      Advanced machine learning algorithms analyze skills,
                      experience, and preferences to create perfect job matches.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <Video className="h-12 w-12 text-primary mx-auto mb-4" />
                    <CardTitle>Video Technology</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      State-of-the-art video processing and AI generation tools
                      that make creating professional video resumes accessible
                      to everyone.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
                    <CardTitle>Enterprise Security</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      Bank-level encryption, GDPR compliance, and robust privacy
                      controls keep your data secure and private.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* FAQ Section */}
          <MarketingFAQ
            schemaId="about"
            heading="About hired.video"
            subheading="Who we are, what we're building, and how we think about the future of hiring."
            items={[
              {
                question: "What is hired.video?",
                answer:
                  "hired.video is an AI-powered career platform that combines AI video resumes, AI resume building and scoring, job matching, interview practice, a career community feed, and sourcing tools for recruiters — all in one workspace. It replaces the patchwork of tools most people use to run their job search.",
              },
              {
                question: "Who founded hired.video?",
                answer:
                  "hired.video was founded by a team of engineers, recruiters, and designers who believed that traditional text resumes were an inefficient way to showcase human talent. We're based in North America and serve members globally.",
              },
              {
                question: "Where is hired.video available?",
                answer:
                  "hired.video is available worldwide via the web app at hired.video and through our Chrome extensions on the Chrome Web Store. The platform is primarily English today, with localization in progress.",
              },
              {
                question: "How does hired.video make money?",
                answer:
                  "We operate a freemium subscription model. Core career tools — building a resume, generating a video, tracking applications, joining the community — are free. Paid plans unlock unlimited AI generations, advanced analytics, team seats, and recruiter features. We don't sell user data, and we never will.",
              },
              {
                question: "How do you handle my data and privacy?",
                answer:
                  "Your data is yours. All content you create is private by default. We're GDPR compliant, encrypt data at rest and in transit, and support full data export and deletion at any time. You can read the full details on our Privacy Policy page.",
              },
              {
                question: "Is hired.video hiring?",
                answer:
                  "Yes! We're always looking for people who care about reshaping how professionals showcase their talents. Check the Careers page for current open roles, and if nothing fits you today, feel free to reach out anyway.",
              },
              {
                question: "How can I contact the team?",
                answer:
                  "Email us at info@hired.video, open the live chat from the bottom-right of any page, or use the Contact form. We respond within 24 hours on business days and typically much faster.",
              },
            ]}
          />

          {/* CTA Section */}
          <section className="py-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-12 rounded-2xl">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Ready to Transform Your Career?
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                Join thousands of professionals who are already using
                hired.video to showcase their talents and find amazing
                opportunities.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    Get Started Today
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    View Pricing
                  </Button>
                </Link>
              </div>
            </div>
          </section>

          <Footer />
        </div>
      </div>
    </div>
  );
}
