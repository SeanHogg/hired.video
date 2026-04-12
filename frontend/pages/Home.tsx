import React, { useCallback, useEffect, useState } from "react";
import { ZodError } from "zod";
import { Link, useLocation } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  MessageSquare,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  Video as VideoIcon,
  CheckCircle2,
  Star,
  FileText,
  Eye,
  BarChart3,
  Target,
  Zap,
} from "lucide-react";

import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import MarketingFAQ from "@/components/MarketingFAQ";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { useSEO } from "@/lib/seo";
import { createRolePermissions } from "@/lib/role-utils";
import { usePersonaPreview } from "@/providers/PersonaPreviewProvider";
import useDashboard from "@/hooks/dashboard/useDashboard";
import ReferralBanner from "@/components/ReferralBanner";
import AdSlot from "@/components/ads/AdSlot";

// Role-specific dashboard components
import JobSeekerDashboard from "@/components/dashboard/JobSeekerDashboard";
import RecruiterDashboard from "@/components/dashboard/RecruiterDashboard";
import EmployerDashboard from "@/components/dashboard/EmployerDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import ProductDashboard from "@/pages/admin/ProductDashboard";
import { AffiliateDashboardContent } from "@/pages/AffiliateDashboard";

// Quick Actions (moved from dashboard section to feed sidebar)
import QuickActions from "@/components/dashboard/shared/QuickActions";

// Feed data + components (reused from Feed.tsx)
import { getFeedPosts, searchFeedPosts } from "@/lib/services/feed-service";
import type {
  FeedPost,
  FeedPostsResponse,
  GetFeedPostsRequest,
  FeedFilters,
} from "@/types/feed";
import FeedPostCard from "@/components/feed/FeedPostCard";
import CreatePostModal from "@/components/feed/CreatePostModal";
import FeedProfileCard from "@/components/feed/FeedProfileCard";
import {
  PostComposerBar,
  FeedFilterTabs,
  FeedRightPanel,
} from "@/pages/Feed";

type PostMode = "text" | "video" | "photo" | "article";

const HOME_STATS = [
  { stat: "500K+", label: "Professionals tracking their careers" },
  { stat: "3×", label: "More interviews with a video resume" },
  { stat: "60s", label: "Average time to generate a video resume" },
  { stat: "24/7", label: "AI career coach, always on" },
];

const HOME_FEATURES = [
  {
    icon: VideoIcon,
    title: "Unified Career Dashboard",
    description:
      "Every resume, application, outreach thread, and interview in one view — tuned to your role (job seeker, recruiter, or employer).",
    bullets: [
      "Role-specific widgets",
      "Application status at a glance",
      "Last-touched activity timeline",
    ],
    border: "border-brand-purple/20 hover:border-brand-purple/40",
    iconColor: "text-brand-purple",
  },
  {
    icon: Sparkles,
    title: "AI Next Best Action",
    description:
      "Your home screen doesn't just show data — it tells you what to do next. Tailor a resume, follow up on a stalled app, or practice an interview.",
    bullets: [
      "Daily recommendations",
      "Smart reminders",
      "1-click jump to tools",
    ],
    border: "border-brand-blue/20 hover:border-brand-blue/40",
    iconColor: "text-brand-blue",
  },
  {
    icon: MessageSquare,
    title: "Career Community Feed",
    description:
      "Share wins, ask for advice, and celebrate offers with a feed built for professionals — not doomscrolling.",
    bullets: [
      "Text, video, and article posts",
      "Privacy controls per post",
      "Hashtag-powered discovery",
    ],
    border: "border-primary/20 hover:border-primary/40",
    iconColor: "text-primary",
  },
];

const HOME_HOW_IT_WORKS = [
  {
    icon: FileText,
    step: "1. Sign Up Free",
    desc: "Create your free account. No credit card, no gimmicks.",
  },
  {
    icon: Sparkles,
    step: "2. Build or Import",
    desc: "Upload an existing resume or let our AI build one with you.",
  },
  {
    icon: Eye,
    step: "3. Track Everything",
    desc: "Applications, outreach, and interviews — always up to date.",
  },
  {
    icon: TrendingUp,
    step: "4. Land the Offer",
    desc: "Follow AI recommendations until you're shaking hands on the new role.",
  },
];

const HOME_TESTIMONIALS = [
  {
    quote:
      "Having every job, resume version, and follow-up in one place changed my search. I finally stopped losing track of which resume went to which company.",
    name: "Alicia Thompson",
    title: "Data Analyst",
  },
  {
    quote:
      "The AI next-best-action feature is wild — it prompted me to follow up with a recruiter on a Tuesday morning and I had an offer by Friday.",
    name: "Marco Silva",
    title: "Sales Engineer",
  },
  {
    quote:
      "I use hired.video Home every morning with my coffee. Dashboard + community feed + video resume studio — it's the only tab I need open during a job search.",
    name: "Nina Patel",
    title: "UX Designer",
  },
];

const HOME_FAQ = [
  {
    question: "What is hired.video?",
    answer:
      "hired.video is an AI-powered career platform that combines a video resume studio, an ATS-friendly resume builder, an AI job-matching engine, interview practice, and a career community feed. Think of it as the one tab you keep open during your entire job search.",
  },
  {
    question: "Is hired.video free to use?",
    answer:
      "Yes. Creating an account, building resumes, generating one video resume, tracking applications, and using the community feed are all free forever. Paid plans unlock unlimited video resumes, advanced AI tools, analytics, and recruiter features.",
  },
  {
    question: "Who is hired.video for?",
    answer:
      "hired.video is built for three personas: job seekers who want to stand out and stay organized, recruiters who need a modern sourcing + screening workflow, and employers who want to hire faster with video-first applications. The dashboard adapts automatically to your role.",
  },
  {
    question: "How is hired.video different from LinkedIn?",
    answer:
      "LinkedIn is a professional network. hired.video is a career workspace. We don't replace LinkedIn — we integrate with it via our Chrome extension. The difference: LinkedIn shows you who you know; hired.video helps you actually run your job search and build a standout video resume.",
  },
  {
    question: "Do I need a camera to make a video resume?",
    answer:
      "No. You can paste any resume into our AI Studio and export a polished 60-second video with animated scenes, professional typography, and optional voiceover — no camera, microphone, or editing skills required. If you prefer to record yourself, we support that too.",
  },
  {
    question: "Does hired.video work with ATS (Applicant Tracking Systems)?",
    answer:
      "Yes. Every resume built in hired.video exports to an ATS-friendly PDF, with clean structure that parses cleanly in Workday, Greenhouse, Lever, Taleo, and most other major ATS platforms. You can also export your resume as Word (.docx) or plain text.",
  },
  {
    question: "Is my data private?",
    answer:
      "Your resumes, applications, and videos are private to you by default. You explicitly choose what to share publicly and who can see each feed post. We're GDPR-compliant, we never sell your data, and you can export or delete everything at any time.",
  },
  {
    question: "How do I get started?",
    answer:
      "Click Get Started Free at the top of this page, create your account in under 30 seconds, and the onboarding will guide you through building your first resume or generating a video. Most users have a shareable video resume in under 5 minutes.",
  },
];

// ─── Unauthenticated marketing page ──────────────────────────────────────────
function HomeMarketingPage({
  sidebarOpen,
  closeSidebar,
  sidebarCollapsed,
  openSidebar,
  toggleSidebar,
}: {
  sidebarOpen: boolean;
  closeSidebar: () => void;
  sidebarCollapsed: boolean;
  openSidebar: () => void;
  toggleSidebar: () => void;
}) {
  const location = useLocation();
  useSEO(location.pathname);

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

        <main className="pt-16">
          <div className="max-w-6xl mx-auto px-4 py-16">
            {/* Hero */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center space-x-2 mb-6">
                <div className="relative">
                  <TrendingUp className="h-12 w-12 text-primary" />
                  <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                </div>
                <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  Your Career Home
                </span>
              </div>
              <h1 className="text-5xl font-bold mb-6">
                Your AI-Powered Career Command Center
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                Track resumes, applications, outreach, and interviews in one
                place — get AI recommendations on your next best move, and
                share wins with a community built for working professionals.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
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
              <p className="mt-4 text-sm text-muted-foreground">
                Free forever • No credit card required • Cancel any upgrade
                anytime
              </p>
            </div>

            {/* Stats */}
            <div className="grid md:grid-cols-4 gap-6 mb-16">
              {HOME_STATS.map((s) => (
                <div key={s.stat} className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    {s.stat}
                  </div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Features */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-4">
                Everything You Need in One Place
              </h2>
              <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
                Three tools that work together: a unified dashboard, an AI that
                tells you what to do next, and a community that has your back.
              </p>
              <div className="grid md:grid-cols-3 gap-8">
                {HOME_FEATURES.map(
                  ({ icon: Icon, title, description, bullets, border, iconColor }) => (
                    <Card
                      key={title}
                      className={`${border} transition-colors`}
                    >
                      <CardHeader>
                        <Icon className={`h-10 w-10 ${iconColor} mb-4`} />
                        <CardTitle>{title}</CardTitle>
                        <CardDescription>{description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          {bullets.map((b) => (
                            <div key={b} className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              {b}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ),
                )}
              </div>
            </div>

            {/* How It Works */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                How It Works
              </h2>
              <div className="grid md:grid-cols-4 gap-8">
                {HOME_HOW_IT_WORKS.map(({ icon: Icon, step, desc }) => (
                  <div key={step} className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Icon className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">{step}</h3>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tool highlights — cross-links to the other marketing pages */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-4">
                Explore the Tools Inside hired.video
              </h2>
              <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
                Every tool is built to work on its own — or as part of the full
                career workflow. Try the ones that fit where you are right now.
              </p>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    icon: VideoIcon,
                    title: "Video Studio",
                    desc: "AI-generated video resumes in 60 seconds",
                    href: "/studio",
                  },
                  {
                    icon: FileText,
                    title: "Resume Builder",
                    desc: "ATS-ready resumes with AI tailoring",
                    href: "/resumes",
                  },
                  {
                    icon: Target,
                    title: "AI Job Match",
                    desc: "Score yourself against any job posting",
                    href: "/tools/job-resume-match",
                  },
                  {
                    icon: Zap,
                    title: "Interview Practice",
                    desc: "Mock interviews with instant AI feedback",
                    href: "/interview",
                  },
                  {
                    icon: BarChart3,
                    title: "Resume Scorer",
                    desc: "Grade any resume in under 10 seconds",
                    href: "/tools/ai-resume-scorer",
                  },
                  {
                    icon: Users,
                    title: "For Recruiters",
                    desc: "Sourcing, pipeline, and video screening",
                    href: "/for-recruiters",
                  },
                  {
                    icon: Briefcase,
                    title: "Job Board",
                    desc: "Browse open roles with video intros",
                    href: "/jobs",
                  },
                  {
                    icon: Sparkles,
                    title: "AI Career Coach",
                    desc: "Chat with a 24/7 career-aware AI",
                    href: "/ai-coach",
                  },
                ].map(({ icon: Icon, title, desc, href }) => (
                  <Link
                    key={title}
                    to={href}
                    className="group p-5 rounded-xl border border-border hover:border-primary/40 hover:shadow-sm transition-all"
                  >
                    <Icon className="h-7 w-7 text-primary mb-3" />
                    <h3 className="font-semibold mb-1 group-hover:text-primary transition-colors">
                      {title}
                    </h3>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </Link>
                ))}
              </div>
            </div>

            {/* Testimonials */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                Trusted by Professionals Everywhere
              </h2>
              <div className="grid md:grid-cols-3 gap-8">
                {HOME_TESTIMONIALS.map((t) => (
                  <Card key={t.name}>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className="h-4 w-4 fill-yellow-400 text-yellow-400"
                          />
                        ))}
                      </div>
                      <p className="text-sm mb-4">&ldquo;{t.quote}&rdquo;</p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                        <div>
                          <p className="font-medium text-sm">{t.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.title}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          {/* FAQ */}
          <MarketingFAQ
            schemaId="home"
            subheading="Answers to the questions new members ask most — about pricing, privacy, and how hired.video fits into your job search."
            items={HOME_FAQ}
          />

          {/* Final CTA */}
          <div className="max-w-4xl mx-auto px-4 py-16">
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-10 rounded-2xl">
              <h3 className="text-3xl font-bold mb-4">
                Ready to Run Your Whole Career From One Tab?
              </h3>
              <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                Join thousands of professionals who've replaced their messy
                spreadsheets, lost follow-ups, and forgotten resume versions
                with a single, AI-powered career home.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                  >
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button size="lg" variant="outline">
                    View Pricing
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}

// ─── Authenticated Home: Dashboard widgets + Feed in one page ────────────────
export default function Home() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { user, isAuthenticated, isLoading, impersonationSession } = useAuth();
  const { personaPreview } = usePersonaPreview();

  // Dashboard state
  const {
    dashboardData,
    loading: dashboardLoading,
    error: dashboardError,
    lastRefresh,
    refreshDashboard,
  } = useDashboard();

  // Feed state
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [filters, setFilters] = useState<FeedFilters>({
    searchTerm: "",
    filter: "all",
    privacy: "public",
  });
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [createPostMode, setCreatePostMode] = useState<PostMode>("text");

  // Effective role: impersonation > persona preview > actual
  const effectiveRole =
    impersonationSession?.role ?? personaPreview ?? user?.role ?? null;
  const rolePermissions = createRolePermissions(effectiveRole);

  const loadFeedPosts = useCallback(
    async (page = 1, append = false) => {
      try {
        setFeedLoading(true);
        setFeedError(null);

        const request: GetFeedPostsRequest = {
          searchTerm: filters.searchTerm || undefined,
          filter: filters.filter === "all" ? undefined : filters.filter,
          privacy: filters.privacy,
          pageNumber: page,
          pageSize: 10,
        };

        let response: FeedPostsResponse;
        if (filters.searchTerm) {
          response = await searchFeedPosts(filters.searchTerm, page, 10);
        } else {
          response = await getFeedPosts(request);
        }

        if (append) {
          setPosts((prev) => [...prev, ...response.posts]);
        } else {
          setPosts(response.posts);
        }
        setHasMore(response.hasNextPage);
        setPageNumber(page);
      } catch (err) {
        setFeedError(
          err instanceof ZodError
            ? "Failed to load feed"
            : err instanceof Error
              ? err.message
              : "Failed to load feed posts",
        );
      } finally {
        setFeedLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    if (isAuthenticated) loadFeedPosts(1, false);
  }, [isAuthenticated, filters, loadFeedPosts]);

  const handlePostCreated = useCallback(() => {
    setCreatePostOpen(false);
    loadFeedPosts(1, false);
  }, [loadFeedPosts]);

  const handlePostLike = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              isLikedByCurrentUser: !post.isLikedByCurrentUser,
              likeCount: post.isLikedByCurrentUser
                ? post.likeCount - 1
                : post.likeCount + 1,
            }
          : post,
      ),
    );
  }, []);

  const handlePostDelete = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((post) => post.id !== postId));
  }, []);

  const handlePostEdit = useCallback(
    (postId: string, updatedPost: FeedPost) => {
      setPosts((prev) =>
        prev.map((post) => (post.id === postId ? updatedPost : post)),
      );
    },
    [],
  );

  const handlePostHide = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((post) => post.id !== postId));
  }, []);

  const openCreate = useCallback((mode: PostMode) => {
    setCreatePostMode(mode);
    setCreatePostOpen(true);
  }, []);

  // Role-to-dashboard component mapping
  const getDashboardComponent = () => {
    const commonProps = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dashboardData: dashboardData as any,
      loading: dashboardLoading,
      onRefresh: refreshDashboard,
    };

    if (rolePermissions.isSuperAdmin) return <ProductDashboard />;
    if (rolePermissions.isAdmin) return <AdminDashboard {...commonProps} />;
    if (rolePermissions.isJobSeeker)
      return <JobSeekerDashboard {...commonProps} />;
    if (rolePermissions.isRecruiter)
      return <RecruiterDashboard {...commonProps} />;
    if (rolePermissions.isEmployer)
      return <EmployerDashboard {...commonProps} />;
    if (rolePermissions.isAffiliate) return <AffiliateDashboardContent />;

    return (
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">Welcome to hired.video</h1>
        <p className="text-muted-foreground">
          Your role ({user?.role}) doesn&apos;t have a specific dashboard yet.
        </p>
      </div>
    );
  };

  // Auth loading
  if (isLoading) {
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
          <div className="pt-16 flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated → marketing page
  if (!isAuthenticated || !user) {
    return (
      <HomeMarketingPage
        sidebarOpen={sidebarOpen}
        closeSidebar={closeSidebar}
        sidebarCollapsed={sidebarCollapsed}
        openSidebar={openSidebar}
        toggleSidebar={toggleSidebar}
      />
    );
  }

  // ─── Authenticated view: Dashboard section → Feed section ───────────────
  return (
    <div className="min-h-screen bg-muted/30">
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

        <div className="pt-16 pb-20">
          {/* ── Dashboard section ── */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <div className="mb-6 sm:mb-8">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1">
                  <h1 className="text-2xl sm:text-3xl font-bold">
                    {dashboardData?.title ?? "Your Home"}
                  </h1>
                  <p className="text-sm sm:text-base text-muted-foreground mt-1">
                    {dashboardData?.description ??
                      "Your dashboard and community feed in one place."}
                  </p>
                  {lastRefresh && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Last updated: {lastRefresh.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <ReferralBanner />
            <div className="flex justify-center mb-4">
              <AdSlot slot="dashboard-banner" size="banner" />
            </div>

            {dashboardLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  Loading dashboard...
                </p>
              </div>
            ) : dashboardError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <span className="flex-1">{dashboardError}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshDashboard}
                    className="min-h-[44px] w-full sm:w-auto"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : dashboardData ? (
              getDashboardComponent()
            ) : (
              <div className="text-center text-sm text-muted-foreground py-8">
                No dashboard data available
              </div>
            )}
          </div>

          {/* ── Divider between Dashboard and Feed ── */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Separator className="my-4" />
          </div>

          {/* ── Feed section ── */}
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-primary" />
                Your Feed
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Share career wins, ask for advice, celebrate offers.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-6 items-start">
              {/* LEFT — Profile card */}
              <div className="hidden lg:block sticky top-24">
                <FeedProfileCard user={user as never} />
              </div>

              {/* CENTER — Post composer + filter tabs + posts */}
              <div className="min-w-0 space-y-4">
                <PostComposerBar user={user as never} onOpen={openCreate} />

                <div className="bg-card rounded-xl overflow-hidden border">
                  <FeedFilterTabs
                    active={filters.filter ?? "all"}
                    onChange={(v) =>
                      setFilters((prev) => ({ ...prev, filter: v }))
                    }
                  />
                </div>

                {feedError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between">
                      <span>{feedError}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadFeedPosts(1, false)}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" /> Retry
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {feedLoading && posts.length === 0 && (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <Card key={i} className="animate-pulse">
                        <CardContent className="p-5">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-muted rounded-full shrink-0" />
                            <div className="flex-1 space-y-2">
                              <div className="h-3.5 bg-muted rounded w-1/4" />
                              <div className="h-3 bg-muted rounded w-full" />
                              <div className="h-3 bg-muted rounded w-3/4" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {!feedLoading && posts.length === 0 ? (
                  <Card>
                    <CardContent className="py-16 text-center">
                      <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">
                        Nothing here yet
                      </h3>
                      <p className="text-muted-foreground text-sm mb-4">
                        Be the first to share something with your network!
                      </p>
                      <Button onClick={() => openCreate("text")}>
                        Start a post
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {posts.map((post) => (
                      <FeedPostCard
                        key={post.id}
                        post={post}
                        onLike={handlePostLike}
                        onComment={() => {}}
                        onDelete={handlePostDelete}
                        onEdit={handlePostEdit}
                        onHide={handlePostHide}
                      />
                    ))}

                    {hasMore && (
                      <div className="text-center">
                        <Button
                          variant="outline"
                          onClick={() => loadFeedPosts(pageNumber + 1, true)}
                          disabled={feedLoading}
                          className="rounded-full"
                        >
                          {feedLoading ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            "Show more posts"
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* RIGHT — Quick Actions + Suggestions */}
              <div className="hidden lg:block sticky top-24 space-y-4">
                <QuickActions userRole={effectiveRole} />
                <FeedRightPanel />
              </div>
            </div>
          </div>
        </div>

        <Footer />
      </div>

      <CreatePostModal
        open={createPostOpen}
        onClose={() => setCreatePostOpen(false)}
        onPostCreated={handlePostCreated}
        initialMode={createPostMode}
      />
    </div>
  );
}
