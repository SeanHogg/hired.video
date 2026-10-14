import "@fontsource-variable/geist";
import { publicProfilePath, publicResumePath } from "@shared/public-paths";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/bricolage-grotesque";
import "./global.css";
import { HiringRouteGate } from "@/components/routing/HiringRouteGate";
// Side-effect import: initialises i18next before any component calls
// useTranslation(). The module exports a `default` and helpers; importing
// for side effects keeps App.tsx out of the loop on every locale change.
import "@/lib/i18n/i18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { Suspense, lazy, useEffect, type ReactNode } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import GlobalErrorHandler from "@/components/GlobalErrorHandler";
import GlobalAIUsageBanner from "@/components/GlobalAIUsageBanner";
import GlobalExplicitContentNotice from "@/components/GlobalExplicitContentNotice";
import { TokenPackSheetHost } from "@/components/billing/TokenPackSheetHost";
import { BadgeUnlockToaster } from "@/components/badges/BadgeUnlockToaster";
import { CelebrationOverlay } from "@/components/points/CelebrationOverlay";
import { CookieConsentBanner } from "@/components/legal/CookieConsentBanner";
import PWAUpdatePrompt from "@/components/PWAUpdatePrompt";
import { DialogHost } from "@/components/ui/DialogHost";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AIProvider } from "@/lib/ai-context";
import { AuthProvider, useAuth, useVerificationBlocked } from "@/lib/auth";
import { useShouldRenderAppChrome } from "@/components/AppShell";
import { LEGACY_REDIRECTS } from "@/lib/routing/legacy-redirects";
import { isVerificationAllowedPath } from "@/lib/routing/verification-allowed-paths";
import LegacyRedirect from "@/components/routing/LegacyRedirect";
import { LocaleSync } from "@/lib/i18n/LocaleSync";
import { ThemeSync } from "@/components/theme/ThemeSync";
import { PermissionDebuggerProvider } from "@/providers/PermissionDebuggerProvider";
import { PersonaPreviewProvider } from "@/providers/PersonaPreviewProvider";
import { PermissionDebuggerPanel } from "@/components/PermissionDebuggerPanel";
import { CartProvider } from "@/lib/cart-context";
import { ContactPanelProvider } from "@/components/ContactPanel";
import { CommHubProvider } from "@/providers/CommHubProvider";
import { HeaderFiltersProvider } from "@/lib/header-filters";
import { runtimeConfig } from "@/lib/runtime-config";
import { logger } from "@/lib/logger";
import { performanceMonitor } from "@/lib/performance";
import { initializeErrorTracking, reportError, reportMessage } from "@/lib/error-tracking";
import { installPaidMediaPixels } from "@/lib/paid-media-pixels";
import { readAttribution } from "@/lib/attribution";
import { useAttributionCapture } from "@/lib/hooks/useAttributionCapture";

// Critical components loaded immediately
import AIChatPanel from "./components/AIChatPanel";
import FloatingAIButton from "./components/FloatingAIButton";
import ChatPanel from "./components/ChatPanel";
import MobileBottomNav from "./components/MobileBottomNav";
import PWAInstallPrompt from "./components/PWAInstallPrompt";

// Critical pages (loaded immediately)
import Index from "./pages/Index";
import PersonaSelection from "./pages/PersonaSelection";
// Auth pages (keep immediate for better UX)
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ConfirmEmail from "./pages/ConfirmEmail";
import VerifyEmail from "./pages/VerifyEmail";
import OAuthCallback from "./pages/OAuthCallback";
import MagicLinkVerify from "./pages/MagicLinkVerify";
import TwoFactorApprove from "./pages/TwoFactorApprove";
import SignupSuccess from "./pages/SignupSuccess";
import AcceptInvitation from "./pages/AcceptInvitation";
import { TOOL_PAGES } from "@/components/tools/tool-pages";

// Lazy load non-critical pages
const PlacementDetail = lazy(() => import("./pages/recruiter/PlacementDetail"));
const TeamActivities = lazy(() => import("./pages/TeamActivities"));
const IntegrationOAuthCallback = lazy(() => import("./pages/IntegrationOAuthCallback"));
const PlacementsList = lazy(() => import("./pages/recruiter/PlacementsList"));
const ForAgencies = lazy(() => import("./pages/ForAgencies"));
const WorkforceGuide = lazy(() => import("./pages/guides/WorkforceGuide"));
const FeaturedCreators = lazy(() => import("./pages/FeaturedCreators"));
const BlogIndex = lazy(() => import("./pages/blog/BlogIndex"));
const BlogPost = lazy(() => import("./pages/blog/BlogPost"));
const SalaryPage = lazy(() => import("./pages/seo/SalaryPage"));
const PlayInvite = lazy(() => import("./pages/PlayInvite"));
const SalaryIndexPage = lazy(() => import("./pages/seo/SalaryIndexPage"));
const ResumeGuidePage = lazy(() => import("./pages/seo/ResumeGuidePage"));
const About = lazy(() => import("./pages/About"));
const Careers = lazy(() => import("./pages/Careers"));
const Checkout = lazy(() => import("./pages/Checkout"));
const CheckoutSuccess = lazy(() => import("./pages/CheckoutSuccess"));
const Companies = lazy(() => import("./pages/Companies"));
const CompanyDetail = lazy(() => import("./pages/CompanyDetail"));
const CompanyReviewsPage = lazy(() => import("./pages/CompanyReviewsPage"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const Home = lazy(() => import("./pages/Home"));
const ForRecruiters = lazy(() => import("./pages/ForRecruiters"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const People = lazy(() => import("./pages/People"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Features = lazy(() => import("./pages/Features"));
const Competitors = lazy(() => import("./pages/Competitors"));
const AudienceLandingPage = lazy(() => import("./pages/landing/AudienceLandingPage"));
const ForIndex = lazy(() => import("./pages/ForIndex"));
const LocationLandingPage = lazy(() => import("./pages/landing/LocationLandingPage"));
const SitemapLocations = lazy(() => import("./pages/SitemapLocations"));
const AdminAudienceTagger = lazy(() => import("./pages/admin/AdminAudienceTagger"));
const RetainedSearchDirectory = lazy(() => import("./pages/RetainedSearchDirectory"));
const CompAnalyzer = TOOL_PAGES["comp-analyzer"];
const References = lazy(() => import("./pages/References"));
const ReferencesShared = lazy(() => import("./pages/ReferencesShared"));
const WarmIntros = lazy(() => import("./pages/WarmIntros"));
const TemplateLandingPage = lazy(() => import("./pages/landing/TemplateLandingPage"));
const TemplatesPage = lazy(() => import("./pages/Templates"));
const Resumes = lazy(() => import("./pages/Resumes"));
const Jobs = lazy(() => import("./pages/Jobs"));
const SearchPage = lazy(() => import("./pages/Search"));
const Settings = lazy(() => import("./pages/Settings"));
const EmailPreferences = lazy(() => import("./pages/EmailPreferences"));
const PaidMediaPage = lazy(() => import("./pages/paid-media/PaidMediaPage"));
const SuperAdminPaidMediaPage = lazy(() => import("./pages/paid-media/SuperAdminPaidMediaPage"));
const ConnectionsPage = lazy(() => import("./pages/settings/Connections"));
const SocialAccountsPage = lazy(() => import("./pages/admin/SocialAccounts"));
const AdminPromotions = lazy(() => import("./pages/admin/Promotions"));
const AdminCoupons = lazy(() => import("./pages/admin/Coupons"));
const AdminTraffic = lazy(() => import("./pages/admin/Traffic"));
const Contributors = lazy(() => import("./pages/Contributors"));
const Tasks = lazy(() => import("./pages/Tasks"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const Tools = lazy(() => import("./pages/Tools"));
const SentimentAnalysis = TOOL_PAGES["sentiment-analysis"];
const PredictiveAssessments = TOOL_PAGES["predictive-assessments"];
const JobResumeMatch = TOOL_PAGES["job-resume-match"];
const SummarizeResume = TOOL_PAGES["summarize-resume"];
const PdfToJson = TOOL_PAGES["pdf-to-json"];
const ResumeOptimizer = TOOL_PAGES["resume-optimizer"];
const SalaryCalculator = TOOL_PAGES["salary-calculator"];
const EmployerResearch = TOOL_PAGES["employer-research"];
const AIResumeScorer = TOOL_PAGES["ai-resume-scorer"];
const ValueProposition = TOOL_PAGES["value-proposition"];
const ResumeTailor = TOOL_PAGES["resume-tailor"];
const FormAutofill = TOOL_PAGES["form-autofill"];
const ResumeConsolidator = TOOL_PAGES["resume-consolidator"];
const XyzResumeReview = TOOL_PAGES["xyz-resume-review"];
const SkillExtractor = TOOL_PAGES["skill-extractor"];
const ProfileAudit = TOOL_PAGES["profile-audit"];
const Career360 = TOOL_PAGES["career-360"];
const InterviewQuestions = TOOL_PAGES["interview-questions"];
const InterviewTemplates = TOOL_PAGES["interview-templates"];
const VideoPitchLab = TOOL_PAGES["video-pitch-lab"];
const MyInterviewAssignments = lazy(() => import("./pages/MyInterviewAssignments"));
const LiveScreenInvite = lazy(() => import("./pages/LiveScreenInvite"));
const CrossJobPipeline = lazy(() => import("./pages/recruit/CrossJobPipeline"));
const LiveScreens = lazy(() => import("./pages/recruit/LiveScreens"));
const AgentRuns = lazy(() => import("./pages/recruit/AgentRuns"));
const VendorSync = TOOL_PAGES["vendor-sync"];
const ToolDetail = lazy(() => import("./pages/ToolDetail"));
const Outreach = lazy(() => import("./pages/Outreach"));
const SourcingBrowse = lazy(() => import("./pages/SourcingBrowse"));
const GigMarketplace = lazy(() => import("./pages/GigMarketplace"));
const GigCreatePage = lazy(() => import("./pages/GigCreatePage"));
const GigDetail = lazy(() => import("./pages/GigDetail"));
const TranscriptSearch = lazy(() => import("./pages/TranscriptSearch"));
const HiringManagerPortal = lazy(() => import("./pages/HiringManagerPortal"));
const PhoneDashboard = lazy(() => import("./pages/PhoneDashboard"));
const Help = lazy(() => import("./pages/Help"));
const HelpArticle = lazy(() => import("./pages/HelpArticle"));
const GettingStartedGuide = lazy(() => import("./pages/guides/GettingStarted"));
const VideoBestPracticesGuide = lazy(() => import("./pages/guides/VideoBestPractices"));
const NetworkingTipsGuide = lazy(() => import("./pages/guides/NetworkingTips"));
const JobSearchStrategiesGuide = lazy(() => import("./pages/guides/JobSearchStrategies"));
const TutorialsGuide = lazy(() => import("./pages/guides/Tutorials"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const PrivacyOptOut = lazy(() => import("./pages/PrivacyOptOut"));
const DataDeletion = lazy(() => import("./pages/DataDeletion"));
const SecurityPage = lazy(() => import("./pages/Security"));
const SecuritySessions = lazy(() => import("./pages/SecuritySessions"));
const Contact = lazy(() => import("./pages/Contact"));
const AffiliateProgram = lazy(() => import("./pages/AffiliateProgram"));
const LearningPlatform = lazy(() => import("./pages/LearningPlatform"));
const LearningPortability = lazy(() => import("./pages/LearningPortability"));
// CHRO People Operations (hired-video extraction): marketing landing +
// the paid in-app roster / 1:1s surfaces.
const PeopleOperations = lazy(() => import("./pages/PeopleOperations"));
const PeopleRoster = lazy(() => import("./pages/people/PeopleRoster"));
const PeopleOneOnOnes = lazy(() => import("./pages/people/PeopleOneOnOnes"));
const PeopleGoals = lazy(() => import("./pages/people/PeopleGoals"));
const PeopleOpsHub = lazy(() => import("./pages/people/PeopleOpsHub"));
const PeopleSurface = lazy(() => import("./pages/people/PeopleSurface"));
const PeopleTeamHealth = lazy(() => import("./pages/people/PeopleTeamHealth"));
const PeopleTco = lazy(() => import("./pages/people/PeopleTco"));
// `/events` (discovery index) and `/map` were consolidated into
// `/tasks` (see Tasks.tsx Discover surface). Sub-pages stay on their
// own URLs because they're per-event detail surfaces, not the
// discovery list.
const EventDetail = lazy(() => import("./pages/EventDetail"));
const EventNew = lazy(() => import("./pages/EventNew"));
const EventManage = lazy(() => import("./pages/EventManage"));
const SectorsIndex = lazy(() => import("./pages/SectorsIndex"));
const SectorLanding = lazy(() => import("./pages/SectorLanding"));
const ResumeTemplatesGallery = lazy(() => import("./pages/ResumeTemplatesGallery"));
const PivotExplorer = lazy(() => import("./pages/PivotExplorer"));

const AICoach = lazy(() => import("./pages/AICoach"));
const ChromeExtension = lazy(() => import("./pages/ChromeExtension"));
const InterviewPractice = lazy(() => import("./pages/InterviewPractice"));


// Other pages (lazy loaded)
const NotFound = lazy(() => import("./pages/NotFound"));
// /profile is now a redirect to the canonical /people/:id — see route below.
const ResumeDetail = lazy(() => import("./pages/ResumeDetail"));
const ResumeReviewPage = lazy(() => import("./pages/ResumeReviewPage"));
const MarketplaceTemplatePreview = lazy(() => import("./pages/MarketplaceTemplatePreview"));
const VoicePublicDetail = lazy(() => import("./pages/marketplace/VoicePublicDetail"));
const CoursePublicDetail = lazy(() => import("./pages/marketplace/CoursePublicDetail"));
const CourseLearner = lazy(() => import("./pages/CourseLearner"));
const LearnerDashboard = lazy(() => import("./pages/LearnerDashboard"));
const FeedRoute = lazy(() => import("./components/feed/FeedRoute"));
const CourseCheckout = lazy(() => import("./pages/CourseCheckout"));
const CourseReviewQueue = lazy(() => import("./pages/CourseReviewQueue"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const CertificateVerify = lazy(() => import("./pages/CertificateVerify"));

// Back-compat: /resumes/VIEWER/:id was the preview sandbox before the declarative
// viewer became the default at /resumes/:id. Old links redirect in-place.
function LegacyViewerRedirect() {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const qs = search.toString();
  return <Navigate to={`${publicResumePath(id)}${qs ? "?" + qs : ""}`} replace />;
}

// Creator profiles live on /people/:id under the Services tab now —
// they're People with a Creator badge, not a separate surface.
function CreatorPublicProfileRedirect() {
  const { userId } = useParams<{ userId: string }>();
  return <Navigate to={`${publicProfilePath(userId)}?tab=services`} replace />;
}

// Back-compat: /resumes/sample?template=X used to be the marketplace template
// preview. It now lives under /marketplace/templates/:templateId — redirect
// inbound links and any TemplateCard "Preview" buttons that haven't updated.
function LegacySampleRedirect() {
  const [search] = useSearchParams();
  const tpl = search.get("template");
  if (!tpl) return <Navigate to="/templates" replace />;
  return <Navigate to={`/marketplace/templates/${tpl}`} replace />;
}

// Back-compat: review subjects linked templates as
// /marketplace/templates/{resume|video}/:id. Résumé and video templates are
// both studio templates now, on the ONE detail page (which resolves an id).
function LegacyKindedTemplateRedirect() {
  const { templateId } = useParams<{ templateId: string }>();
  return <Navigate to={`/marketplace/templates/${encodeURIComponent(templateId ?? "")}`} replace />;
}

// Legacy /recruit/* surfaces moved to /services/* (My Services hub).
// These two carry an :id param so the parent Navigate can't express the
// rewrite in a single line — small wrappers keep App.tsx readable.
function RecruitCandidateRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/services/candidates/${id}`} replace />;
}
function RecruitPitchDeckRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/people/pitch-decks/${id}`} replace />;
}
function ServicesPitchDeckRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/people/pitch-decks/${id}`} replace />;
}
// Gigs moved into the My Services hub (/services/gigs). The detail route
// carries an :id, so a tiny wrapper rewrites the legacy /gigs/:id deep-link.
function GigDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/services/gigs/${id}`} replace />;
}
const Studio = lazy(() => import("./pages/studio/Studio"));
const StudioWorkspace = lazy(() => import("./pages/studio/StudioWorkspace"));
const DistributionHub = lazy(() => import("./pages/studio/distribution/DistributionHub"));
const PublicProfile = lazy(() => import("./pages/PublicProfile"));
const ATSLandingPage = lazy(() => import("./pages/studio/ATSLandingPage"));
const AsyncInterviewPage = lazy(() => import("./pages/studio/AsyncInterviewPage"));
const TakeHomeDeliveryPage = lazy(() => import("./pages/TakeHomeDeliveryPage"));
const ResumeRoast = TOOL_PAGES["resume-roast"];
const PublicVideoResume = lazy(() => import("./pages/PublicVideoResume"));
const LegacyPublicVideoRedirect = lazy(() => import("./pages/LegacyPublicVideoRedirect"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
// Job create / edit retired into the Studio (lib/routing/legacy-redirects.ts);
// the dedicated screening route hosts the structured screening builder.
const JobScreeningPage = lazy(() => import("./pages/JobScreeningPage"));
const JobApplicationPage = lazy(() => import("./pages/JobApplicationPage"));
const JobEmbed = lazy(() => import("./pages/JobEmbed"));
const TemplatesReview = lazy(() => import("./pages/admin/TemplatesReview"));
const BdPipeline = lazy(() => import("./pages/recruiter/BdPipeline"));
const TakeHomeAssignment = lazy(() => import("./pages/TakeHomeAssignment"));
const PeopleDetail = lazy(() => import("./pages/PeopleDetail"));
const ServicesManagement = lazy(() => import("./pages/ServicesManagement"));
const BookPage = lazy(() => import("./pages/bookings/BookPage"));
const ReservationPage = lazy(() => import("./pages/bookings/ReservationPage"));
const BookingsHost = lazy(() => import("./pages/bookings/BookingsHost"));
const ArticlesIndex = lazy(() => import("./pages/ArticlesIndex"));
const ArticleView = lazy(() => import("./pages/ArticleView"));
const ArticleByIdRedirect = lazy(() => import("./components/article/ArticleByIdRedirect"));
const EmbeddedResume = lazy(() => import("./pages/EmbeddedResume"));
const ConnectAuthorize = lazy(() => import("./pages/ConnectAuthorize"));
const EmbeddedStudioProject = lazy(() => import("./pages/EmbeddedStudioProject"));
const SharedCandidateResume = lazy(() => import("./pages/SharedCandidateResume"));
const SharedPitchDeck = lazy(() => import("./pages/SharedPitchDeck"));
const CandidateDetail = lazy(() => import("./pages/services/CandidateDetail"));
const PitchDecksList = lazy(() => import("./pages/services/PitchDecksList"));
const PitchDeckBuilder = lazy(() => import("./pages/services/PitchDeckBuilder"));
const ScreeningTemplates = lazy(() => import("./pages/services/ScreeningTemplates"));
const CandidateScreening = lazy(() => import("./pages/CandidateScreening"));
const HiringOnboarding = lazy(() => import("./pages/services/HiringOnboarding"));
const ScorecardsPage = lazy(() => import("./pages/services/ScorecardsPage"));
const ProductDashboard = lazy(() => import("./pages/admin/ProductDashboard"));
const FeedManagement = lazy(() => import("./pages/admin/FeedManagement"));
const DashboardFeedCuration = lazy(() => import("./pages/admin/DashboardFeedCuration"));
const RoleAccessManager = lazy(() => import("./pages/admin/RoleAccessManager"));
const ActiveUsers = lazy(() => import("./pages/admin/ActiveUsers"));
const CampaignManager = lazy(() => import("./pages/admin/CampaignManager"));
const PostDetail = lazy(() => import("./pages/PostDetail"));
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));
const CompanyManagement = lazy(() => import("./pages/admin/CompanyManagement"));
const RolesPermissions = lazy(() => import("./pages/admin/RolesPermissions"));
const JobsManagement = lazy(() => import("./pages/admin/JobsManagement"));
const StudioManagement = lazy(() => import("./pages/admin/StudioManagement"));
const StorageManagement = lazy(() => import("./pages/admin/StorageManagement"));
const BillingManagement = lazy(() => import("./pages/admin/BillingManagement"));
const ModuleManagement = lazy(() => import("./pages/admin/ModuleManagement"));
const AuditLog = lazy(() => import("./pages/admin/AuditLog"));
const Workers = lazy(() => import("./pages/admin/Workers"));
const Security = lazy(() => import("./pages/admin/Security"));
const ToolUsage = lazy(() => import("./pages/admin/ToolUsage"));
const PageEmbeds = lazy(() => import("./pages/admin/PageEmbeds"));
const ThemeCalendar = lazy(() => import("./pages/admin/ThemeCalendar"));
const HelpMappings = lazy(() => import("./pages/admin/HelpMappings"));
const ExtensionTelemetry = lazy(() => import("./pages/admin/ExtensionTelemetry"));
const AIVendors = lazy(() => import("./pages/admin/AIVendors"));
const SystemSettings = lazy(() => import("./pages/admin/SystemSettings"));
const ModerationQueue = lazy(() => import("./pages/admin/ModerationQueue"));
const AdminAccountAnalytics = lazy(() => import("./pages/admin/AccountAnalytics"));
const AdminPartners = lazy(() => import("./pages/admin/Partners"));
const PointsPage = lazy(() => import("./pages/Points"));
const AdminPoints = lazy(() => import("./pages/admin/Points"));
const RewardsPage = lazy(() => import("./pages/Rewards"));
import AdminLayout from "./components/admin/AdminLayout";
import AdminSection from "./components/admin/AdminSection";
import { ADMIN_GROUPS, ADMIN_LEGACY_REDIRECTS } from "./lib/admin-nav";

// Consolidated admin groups → their `?view=` segment content (#2277). Keyed by
// AdminGroup.id then segment `view` ("" for single-view groups). Pages stay
// lazy; AdminSection mounts only the active node.
const ADMIN_SECTION_ELEMENTS: Record<string, Record<string, ReactNode>> = {
  dashboard: { "": <ProductDashboard /> },
  users: { registered: <UserManagement />, live: <ActiveUsers /> },
  companies: { "": <CompanyManagement /> },
  access: { roles: <RolesPermissions />, modules: <RoleAccessManager /> },
  feed: {
    notifications: <FeedManagement />,
    dashboard: <DashboardFeedCuration />,
    campaigns: <CampaignManager />,
  },
  studio: {
    content: <StudioManagement />,
    embeds: <PageEmbeds />,
    social: <SocialAccountsPage />,
    promotions: <AdminPromotions />,
    calendar: <ThemeCalendar />,
  },
  jobs: { "": <JobsManagement /> },
  insights: {
    traffic: <AdminTraffic />,
    accounts: <AdminAccountAnalytics />,
    tools: <ToolUsage />,
    extension: <ExtensionTelemetry />,
  },
  trust: {
    moderation: <ModerationQueue />,
    security: <Security />,
    audit: <AuditLog />,
  },
  billing: { "": <BillingManagement />, coupons: <AdminCoupons /> },
  modules: { "": <ModuleManagement /> },
  partners: { "": <AdminPartners /> },
  system: {
    settings: <SystemSettings />,
    storage: <StorageManagement />,
    workers: <Workers />,
    "ai-vendors": <AIVendors />,
  },
};

// Loading component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
  </div>
);

// Simple route guards
function RequireAuth({ children }: { children: JSX.Element }) {
  const { isAuthenticated } = useAuthSafe();
  if (!isAuthenticated) {
    const intended = window.location.pathname + window.location.search;
    const params = new URLSearchParams({ redirect: intended });
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }
  return children;
}

function RequireVerified({ children }: { children: JSX.Element }) {
  const { isAuthenticated, isLoading } = useAuthSafe();
  const blocked = useVerificationBlocked();
  // Avoid false redirects while auth/verification status is initializing
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) {
    const intended = window.location.pathname + window.location.search;
    const params = new URLSearchParams({ redirect: intended });
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }
  if (blocked) {
    const intended = window.location.pathname + window.location.search;
    const params = new URLSearchParams({ redirect: intended });
    return <Navigate to={`/verify-email?${params.toString()}`} replace />;
  }
  return children;
}

// Any authenticated route is blocked until email is verified. Runs once for the
// whole app so individual <Route> entries don't each need <RequireVerified>.
// Shares the verification predicate with <AppShell> and <GlobalChrome> via
// `useVerificationBlocked` — single source of truth for "user in limbo."
// Allowed paths (including `/` itself — #1658) live in
// `lib/routing/verification-allowed-paths.ts`.
function GlobalVerificationGate({ children }: { children: ReactNode }) {
  const blocked = useVerificationBlocked();
  const location = useLocation();

  if (!blocked) return children as JSX.Element;

  const allowed = isVerificationAllowedPath(location.pathname);
  if (allowed) return children as JSX.Element;

  const intended = location.pathname + location.search;
  const params = new URLSearchParams({ redirect: intended });
  return <Navigate to={`/verify-email?${params.toString()}`} replace />;
}

// Globally-mounted chrome that hangs off App.tsx (not inside any page).
// Inherits the same `useShouldRenderAppChrome` predicate as <AppShell> —
// renders only after auth has settled and the user is not in verification
// limbo. While auth bootstraps, returns null so the data-fetching hooks
// these components own (CommunicationHub → /api/inbox, AITokenPill →
// /api/Billing/token-budget, ChatPanel → conversations) never get a chance
// to fire optimistically and then bail. The hooks themselves also gate
// via `useApiReady` for any non-chrome consumer that might mount them.
function GlobalChrome(): JSX.Element | null {
  if (!useShouldRenderAppChrome()) return null;
  return (
    <>
      {/* Self-hides (with its spacer) on the chrome-free studio editor. */}
      <MobileBottomNav />

      {/* Global AI Components - Available on all pages */}
      <FloatingAIButton />
      <AIChatPanel />
      {/* Global human-to-human chat mini-windows. Opened by the
          CommunicationHub bell in the Navigation header. */}
      <ChatPanel />
    </>
  );
}

function useAuthSafe() {
  // Directly use the Auth context; avoid brittle require()-based fallback that can misreport state
  return useAuth();
}

// /profile → /people/{user.id} (or /people/{slug} if available). Keeps the
// legacy URL working for nav links, emails, and deep-linking without a
// dedicated Profile page — one canonical owner view at /people/:id.
function ProfileRedirect() {
  const { user, isAuthenticated, isLoading } = useAuthSafe();
  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) {
    const intended = "/profile";
    const params = new URLSearchParams({ redirect: intended });
    return <Navigate to={`/login?${params.toString()}`} replace />;
  }
  const target = user?.slug || user?.id;
  if (!target) return <PageLoader />;
  return <Navigate to={publicProfilePath(target)} replace />;
}

// Create a client with production-ready configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: runtimeConfig.isProduction ? 3 : 1,
      staleTime: 10 * 60 * 1000, // 10 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
      // Tab-switch refetch was firing every active query on focus return
      // and was the single biggest source of avoidable API traffic.
      // Hooks that need fresh data on focus opt in per-query.
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: runtimeConfig.isProduction ? 2 : 0,
      onError: (error) => {
        logger.error("Mutation error", {
          error: error instanceof Error ? error.message : String(error),
        });

        // Report to error tracking
        if (error instanceof Error) {
          reportError(error, { type: "mutation" });
        } else {
          reportMessage(`Mutation error: ${String(error)}`, "error", { type: "mutation" });
        }
      },
    },
  },
});

// Initialize error tracking (GlitchTip/Sentry compatible)
initializeErrorTracking();

// Install paid-media pixels (Meta/Google/LinkedIn/TikTok/Bing) for the
// hired.video house workspace. Captures landing-page click IDs into
// cookies, then injects platform pixels based on the public config.
// Fire-and-forget — safe even if /api/paid-media/pixels/public 404s.
installPaidMediaPixels().catch((err) => {
  if (runtimeConfig.isDevelopment) console.warn("[paid-media] pixel install failed", err);
});

// Log current configuration in development
if (runtimeConfig.isDevelopment) {
  runtimeConfig.logConfig();
}

// Initialize performance monitoring
if (runtimeConfig.performance.MONITORING) {
  performanceMonitor.recordMemoryUsage();

  // Record memory usage periodically
  setInterval(() => {
    performanceMonitor.recordMemoryUsage();
  }, 60000); // Every minute
}

// Global error handler for unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  const error = new Error(`Unhandled promise rejection: ${event.reason}`);
  logger.error("Unhandled promise rejection", {
    reason: event.reason,
    promise: event.promise,
  });

  // Report to error tracking
  reportError(error, {
    type: "unhandledrejection",
    reason: event.reason,
  });

  // Prevent the default browser behavior
  event.preventDefault();
});

// Global error handler for uncaught errors
window.addEventListener("error", (event) => {
  logger.error("Uncaught error", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
  });

  // Report to error tracking
  if (event.error) {
    reportError(event.error, {
      type: "uncaughterror",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  }
});


function ReferralCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("ref");
      if (code) {
        sessionStorage.setItem("ref", code);
      }
    } catch {
      // no-op
    }
  }, []);
  return null;
}

// Fires a GTM page_view event on every SPA route change. Attribution
// capture (first-touch `?ref=` + `utm_*` into a 30-day cookie) is
// delegated to the shared `useAttributionCapture` hook — see
// `lib/attribution.ts` for the single-source policy.
function GTMPageTracker() {
  const location = useLocation();
  useAttributionCapture();

  useEffect(() => {
    try {
      const attr = readAttribution();
      const w = window as any;
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push({
        event: "page_view",
        page_path: location.pathname + location.search,
        page_title: document.title,
        utm_source: attr.utmSource,
        utm_medium: attr.utmMedium,
        utm_campaign: attr.utmCampaign,
        utm_term: attr.utmTerm,
        utm_content: attr.utmContent,
      });
    } catch {
      // no-op
    }
  }, [location.pathname, location.search]);

  return null;
}

// Mirrors the `?print=1` querystring onto a `data-print-mode` attribute on
// <body>. Paired with the CSS rule in global.css that hides any element
// tagged `data-print-hide` while the attribute is set — so the AI brain,
// mobile nav, install prompt, and chat panels disappear from the on-screen
// print-preview view, not just from the actual print render. Keeping the
// detection in one place (rather than a `printMode` boolean prop drilled
// into every chrome component) is what lets new chrome opt in by tagging
// `data-print-hide` and nothing else.
function PrintModeBodyAttribute() {
  const [searchParams] = useSearchParams();
  const printMode = searchParams.get("print") === "1";
  useEffect(() => {
    if (printMode) {
      document.body.dataset.printMode = "true";
    } else {
      delete document.body.dataset.printMode;
    }
    return () => {
      delete document.body.dataset.printMode;
    };
  }, [printMode]);
  return null;
}

const App = () => (
  <ErrorBoundary
    level="critical"
    onError={(error, errorInfo) => {
      logger.error("Critical application error", {
        error: error.message,
        errorInfo,
      });

      // Report to error tracking
      reportError(error, {
        type: "react-error-boundary",
        errorInfo,
      });
    }}
  >
    <QueryClientProvider client={queryClient}>
      {/* attribute="class" → toggles <html class="dark">, matching global.css
          + the no-FOUC bootstrap in index.html. enableSystem honours the OS
          preference for "system"; disableTransitionOnChange avoids a colour
          smear on every element when switching. */}
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
      <AuthProvider>
        <LocaleSync />
        <ThemeSync />
        <PersonaPreviewProvider>
        <PermissionDebuggerProvider>
          <CartProvider>
            <AIProvider>
              <TooltipProvider>
                <BrowserRouter>
                  {/* Global chrome lives inside <BrowserRouter> so any
                      surface that conditionally renders a <Link> /
                      useNavigate (e.g. AIUsageLimitErrorBanner) has
                      router context — mounting above caused a crash on
                      the first AI_USAGE_LIMIT_REACHED event. */}
                  <Toaster />
                  <DialogHost />
                  <Sonner />
                  <GlobalErrorHandler />
                  <GlobalAIUsageBanner />
                  <GlobalExplicitContentNotice />
                  <TokenPackSheetHost />
                  <BadgeUnlockToaster />
                  <CelebrationOverlay />
                  <CookieConsentBanner />
                  <PWAUpdatePrompt />
                  <HeaderFiltersProvider>
                  <CommHubProvider>
                  <ContactPanelProvider>
	                  <ReferralCapture />
                  <GTMPageTracker />

                  <Suspense fallback={<PageLoader />}>
                    <GlobalVerificationGate>
                    <Routes>
                      <Route path="/" element={<Index />} />

                      <Route path="/login" element={<Login />} />
                      <Route path="/signup" element={<Signup />} />
                      <Route
                        path="/signup-success"
                        element={<SignupSuccess />}
                      />
                      <Route
                        path="/forgot-password"
                        element={<ForgotPassword />}
                      />
                      <Route
                        path="/reset-password"
                        element={<ResetPassword />}
                      />
                          <Route path="/verify-email" element={<VerifyEmail />} />
                      <Route path="/email-preferences/:token" element={<EmailPreferences />} />

                      <Route path="/confirm-email" element={<ConfirmEmail />} />
                      <Route path="/auth/callback" element={<OAuthCallback />} />
                      <Route path="/auth/magic-link" element={<MagicLinkVerify />} />
                      <Route path="/auth/2fa-approve" element={<TwoFactorApprove />} />
                      <Route
                        path="/accept-invitation"
                        element={<AcceptInvitation />}
                      />
                      <Route
                        path="/persona-selection"
                        element={<PersonaSelection />}
                      />
                      <Route path="/profile" element={<ProfileRedirect />} />
                      {/* 3D world play invite (gap #1637) — public,
                          no auth required. Anonymous guests can join. */}
                      <Route path="/play/:token" element={<PlayInvite />} />
                      <Route path="/dashboard" element={<Home />} />
                      <Route path="/recruiter/placements" element={<HiringRouteGate><PlacementsList /></HiringRouteGate>} />
                      <Route path="/team" element={<RequireVerified><TeamActivities /></RequireVerified>} />
                      <Route path="/recruiter/placements/:id" element={<HiringRouteGate><PlacementDetail /></HiringRouteGate>} />
                      <Route path="/points" element={<PointsPage />} />
                      <Route path="/rewards" element={<RewardsPage />} />
                      <Route path="/home" element={<Navigate to="/dashboard" replace />} />
                      <Route path="/feed" element={<FeedRoute />} />
                      <Route path="/feed/:id" element={<PostDetail />} />
                      <Route path="/onboarding" element={<RequireVerified><Onboarding /></RequireVerified>} />
                      <Route path="/features" element={<Features />} />
                      <Route path="/pricing" element={<Pricing />} />
                      <Route path="/vs-competitors" element={<Competitors />} />
                      <Route path="/for" element={<ForIndex />} />
                      <Route path="/for/:audience" element={<AudienceLandingPage />} />
                      <Route path="/retained-search" element={<RetainedSearchDirectory />} />
                      {/* Reference contacts hold private names/emails/phones —
                          gate behind auth so signed-out visitors can't reach the
                          owner-management surface. The recipient share view below
                          stays public (it's token-gated + NDA-walled). */}
                      <Route path="/references" element={<RequireVerified><References /></RequireVerified>} />
                      <Route path="/references/shared/:token" element={<ReferencesShared />} />
                      <Route path="/network/warm-intros" element={<WarmIntros />} />
                      <Route path="/in/:country" element={<LocationLandingPage />} />
                      <Route path="/in/:country/:state" element={<LocationLandingPage />} />
                      <Route path="/in/:country/:state/:city" element={<LocationLandingPage />} />
                      <Route path="/sitemap/locations" element={<SitemapLocations />} />
                      <Route path="/admin/audiences" element={<AdminAudienceTagger />} />
                      <Route path="/templates" element={<TemplatesPage />} />
                      <Route path="/templates/:slug" element={<TemplateLandingPage />} />
                      <Route
                        path="/compare"
                        element={<Navigate to="/vs-competitors" replace />}
                      />
                      <Route
                        path="/alternatives"
                        element={<Navigate to="/vs-competitors" replace />}
                      />
                      <Route
                        path="/for-recruiters"
                        element={<HiringRouteGate><ForRecruiters /></HiringRouteGate>}
                      />
                      <Route path="/for-agencies" element={<HiringRouteGate><ForAgencies /></HiringRouteGate>} />
                      <Route path="/guides/workforce" element={<HiringRouteGate><WorkforceGuide /></HiringRouteGate>} />
                      <Route path="/about" element={<About />} />
                      <Route path="/careers" element={<Careers />} />
                      <Route path="/resumes" element={<Resumes />} />
                      <Route
                        path="/resumes/upload"
                        element={<Navigate to="/resumes" replace />}
                      />
                      {/* Legacy `/resumes/upload/video` wizard was a phantom
                          flow — the backend never had a worker to flip
                          `videos.status` from Queued → Completed, so users
                          got stuck at 5% forever. Studio is the real path;
                          redirect any in-flight links rather than 404. */}
                      <Route
                        path="/resumes/upload/video"
                        element={<Navigate to="/studio" replace />}
                      />
                      <Route path="/studio" element={<Studio />} />
                      {/* Scheduled posts + the queue (#2047) — static, so it wins over /studio/:id. */}
                      <Route path="/studio/distribution" element={<RequireAuth><DistributionHub /></RequireAuth>} />
                      {/* ONE workspace for every way in (lib/workspace/workspace-route.ts):
                          a career kit or a studio format, same frame, same component —
                          so a kit's URL can move /studio/new → /studio/<id> without remounting. */}
                      <Route path="/studio/resume/:resumeId" element={<StudioWorkspace />} />
                      <Route path="/studio/:id" element={<StudioWorkspace />} />
                      <Route path="/studio/:provider/callback" element={<IntegrationOAuthCallback />} />
                      <Route path="/u/:handle" element={<PublicProfile />} />
                      <Route path="/interview" element={<InterviewPractice />} />
                      <Route path="/resume-roast" element={<Navigate to="/tools/resume-roast" replace />} />
                      <Route path="/tools/resume-roast" element={<ResumeRoast />} />
                      <Route path="/blog" element={<BlogIndex />} />
                      <Route path="/blog/:slug" element={<BlogPost />} />
                      <Route path="/salary" element={<SalaryIndexPage />} />
                      <Route path="/salary/:jobSlug" element={<SalaryPage />} />
                      <Route path="/salary/:jobSlug/:locationSlug" element={<SalaryPage />} />
                      <Route path="/resume-guide/:jobSlug" element={<ResumeGuidePage />} />
                      {/* Every retired entity create / edit form route
                          (résumé, job, company — #1912/#1914/#1915/#1955)
                          bounces to the studio. ONE table:
                          lib/routing/legacy-redirects.ts. */}
                      {LEGACY_REDIRECTS.map((row) => (
                        <Route key={row.path} path={row.path} element={<LegacyRedirect row={row} />} />
                      ))}
                      <Route path="/resumes/VIEWER/:id" element={<LegacyViewerRedirect />} />
                      <Route path="/resumes/sample" element={<LegacySampleRedirect />} />
                      <Route path="/resumes/:id" element={<ResumeDetail />} />
	                      <Route path="/resume/:id" element={<ResumeDetail />} />
                      {/* Resume feedback / review surface (#1947). Owner opens
                          by review id; an invited reviewer opens the share link
                          by token (works unauthenticated). */}
                      <Route path="/resume-review/:reviewId" element={<ResumeReviewPage />} />
                      <Route path="/r/:token" element={<ResumeReviewPage />} />
                      <Route path="/jobs" element={<Jobs />} />
                      <Route path="/sourcing/browse" element={<SourcingBrowse />} />
                      {/* Gigs folded into the My Services hub (/services/gigs);
                          the old top-level /gigs URLs redirect below. */}
                      <Route path="/gigs" element={<Navigate to="/services/gigs" replace />} />
                      <Route path="/gigs/new" element={<Navigate to="/services/gigs/new" replace />} />
                      <Route path="/gigs/:id" element={<GigDetailRedirect />} />
                      <Route path="/transcripts/search" element={<TranscriptSearch />} />
                      <Route path="/pipeline/portal/:token" element={<HiringManagerPortal />} />
                      <Route path="/jobs/:id/screening" element={<JobScreeningPage />} />
                      <Route path="/jobs/:id/apply" element={<JobApplicationPage />} />
                      {/* #412 — public job embed renderer (iframe-friendly). */}
                      <Route path="/jobs/embed/:id" element={<JobEmbed />} />
                      <Route path="/jobs/:id" element={<JobDetail />} />
                      {/* #1209 — public live-screen candidate accept/decline page. */}
                      <Route path="/live-screen/invite/:token" element={<LiveScreenInvite />} />
                      {/* #188 — SuperAdmin templates review queue. */}
                      <Route path="/admin/templates/review" element={<TemplatesReview />} />
                      {/* #99/#222/#223 — Recruiter BD pipeline Kanban. */}
                      <Route path="/recruiter/pipeline" element={<HiringRouteGate><BdPipeline /></HiringRouteGate>} />
                      {/* #1386 — Candidate-facing take-home magic-link page. */}
                      <Route path="/take-home/:token" element={<TakeHomeAssignment />} />
                      <Route path="/companies" element={<Companies />} />
                      <Route path="/affiliate-program" element={<AffiliateProgram />} />
                      <Route path="/learning-platform" element={<LearningPlatform />} />
                      <Route path="/learning/portability" element={<RequireVerified><LearningPortability /></RequireVerified>} />
                      {/* CHRO People Operations — public marketing + paid in-app surfaces */}
                      <Route path="/people-operations" element={<HiringRouteGate><PeopleOperations /></HiringRouteGate>} />
                      <Route path="/people/roster" element={<HiringRouteGate><RequireVerified><PeopleRoster /></RequireVerified></HiringRouteGate>} />
                      <Route path="/people/one-on-ones" element={<HiringRouteGate><RequireVerified><PeopleOneOnOnes /></RequireVerified></HiringRouteGate>} />
                      <Route path="/people/goals" element={<HiringRouteGate><RequireVerified><PeopleGoals /></RequireVerified></HiringRouteGate>} />
                      <Route path="/people-ops" element={<HiringRouteGate><RequireVerified><PeopleOpsHub /></RequireVerified></HiringRouteGate>} />
                      <Route path="/people/team-health" element={<HiringRouteGate><RequireVerified><PeopleTeamHealth /></RequireVerified></HiringRouteGate>} />
                      <Route path="/people/tco" element={<HiringRouteGate><RequireVerified><PeopleTco /></RequireVerified></HiringRouteGate>} />
                      <Route path="/people/s/*" element={<HiringRouteGate><RequireVerified><PeopleSurface /></RequireVerified></HiringRouteGate>} />
                      <Route path="/affiliate/dashboard" element={<Navigate to="/services" replace />} />

                      {/* Public events + coffee networking (gap #1240).
                          Discovery (`/events`) and map (`/map`) folded
                          into `/tasks` Discover surface; the per-event
                          surfaces below keep their own URLs. */}
                      <Route path="/events" element={<Navigate to="/tasks?surface=discover" replace />} />
                      <Route path="/events/new" element={<EventNew />} />
                      <Route path="/events/:idOrSlug" element={<EventDetail />} />
                      <Route path="/events/:idOrSlug/manage" element={<EventManage />} />
                      <Route path="/map" element={<Navigate to="/tasks?surface=discover&view=map" replace />} />

                      {/* AI-resilient sector surfaces — see shared/sectors.ts SSoT. */}
                      <Route path="/sectors" element={<SectorsIndex />} />
                      <Route path="/sectors/:sector" element={<SectorLanding />} />
                      <Route path="/resume-templates" element={<ResumeTemplatesGallery />} />
                      <Route path="/pivot-explorer" element={<PivotExplorer />} />

                      <Route
                        path="/companies/:slug/reviews"
                        element={<CompanyReviewsPage />}
                      />
                      <Route
                        path="/companies/:id"
                        element={<CompanyDetail />}
                      />
                      <Route path="/search" element={<SearchPage />} />
                      <Route path="/people" element={<People />} />
                      {/* Hiring-side surfaces moved out of /services and now live
                          under /people alongside Browse / Connections / Talent
                          Pool / Submissions — one nav for everything
                          people-related. Old /services/* URLs redirect below. */}
                      <Route
                        path="/people/pitch-decks"
                        element={<HiringRouteGate><RequireVerified><PitchDecksList /></RequireVerified></HiringRouteGate>}
                      />
                      <Route
                        path="/people/pitch-decks/:id"
                        element={<HiringRouteGate><RequireVerified><PitchDeckBuilder /></RequireVerified></HiringRouteGate>}
                      />
                      <Route
                        path="/people/hiring"
                        element={<HiringRouteGate><RequireVerified><HiringOnboarding /></RequireVerified></HiringRouteGate>}
                      />
                      <Route
                        path="/people/scorecards"
                        element={<HiringRouteGate><RequireVerified><ScorecardsPage /></RequireVerified></HiringRouteGate>}
                      />
                      <Route path="/people/:id" element={<PeopleDetail />} />
                      {/* Legacy /recruit/* paths — pool list moved to /resumes?tab=sourced;
                          per-candidate detail still lives at /services/candidates/:id. */}
                      <Route path="/recruit" element={<Navigate to="/resumes?tab=sourced" replace />} />
                      <Route path="/recruit/candidates" element={<Navigate to="/resumes?tab=sourced" replace />} />
                      <Route path="/recruit/candidates/:id" element={<RecruitCandidateRedirect />} />
                      <Route path="/recruit/pitch-decks" element={<HiringRouteGate><Navigate to="/people/pitch-decks" replace /></HiringRouteGate>} />
                      <Route path="/recruit/pitch-decks/:id" element={<HiringRouteGate><RecruitPitchDeckRedirect /></HiringRouteGate>} />
                      <Route path="/recruit/settings" element={<HiringRouteGate><Navigate to="/services/settings" replace /></HiringRouteGate>} />
                      <Route path="/checkout" element={<Checkout />} />
                      <Route path="/checkout/success" element={<CheckoutSuccess />} />
                      <Route path="/tools" element={<Tools />} />
                      {/* /learning is the SEO-friendly alias for the
                          built-in Learning Content Library tab on /tools.
                          Same page, learning tab pre-selected. */}
                      <Route path="/learning" element={<Navigate to="/tools?tab=learning" replace />} />
                      <Route path="/chat" element={<AICoach />} />
                      <Route path="/ai-coach" element={<AICoach />} />
                      {/* Legacy PascalCase tool routes — redirect to the
                          kebab-case canonical so we ship one URL per tool.
                          `useSEO` already emits `rel=canonical`, but a 308
                          via <Navigate replace> kills the duplicate-content
                          ambiguity for crawlers and analytics outright. */}
                      <Route path="/Tools/SentimentAnalysis" element={<Navigate to="/tools/sentiment-analysis" replace />} />
                      <Route path="/tools/sentiment-analysis" element={<SentimentAnalysis />} />
                      <Route path="/tools/comp-analyzer" element={<CompAnalyzer />} />
                      <Route path="/tools/predictive-assessments" element={<PredictiveAssessments />} />
                      <Route path="/Tools/JobResumeMatch" element={<Navigate to="/tools/job-resume-match" replace />} />
                      <Route path="/tools/job-resume-match" element={<JobResumeMatch />} />
                      <Route path="/Tools/SummarizeResume" element={<Navigate to="/tools/summarize-resume" replace />} />
                      <Route path="/tools/summarize-resume" element={<SummarizeResume />} />
                      <Route path="/Tools/pdftojson" element={<Navigate to="/tools/pdf-to-json" replace />} />
                      <Route path="/Tools/PdfToJson" element={<Navigate to="/tools/pdf-to-json" replace />} />
                      <Route path="/tools/pdf-to-json" element={<PdfToJson />} />
                      <Route path="/Tools/ResumeOptimizer" element={<Navigate to="/tools/resume-optimizer" replace />} />
                      <Route path="/tools/resume-optimizer" element={<ResumeOptimizer />} />
                      <Route path="/Tools/SalaryCalculator" element={<Navigate to="/tools/salary-calculator" replace />} />
                      <Route path="/tools/salary-calculator" element={<SalaryCalculator />} />
                      <Route path="/tools/employer-research" element={<EmployerResearch />} />
                      <Route path="/Tools/AIResumeScorer" element={<Navigate to="/tools/ai-resume-scorer" replace />} />
                      <Route path="/tools/ai-resume-scorer" element={<AIResumeScorer />} />
                      <Route path="/Tools/ValueProposition" element={<Navigate to="/tools/value-proposition" replace />} />
                      <Route path="/tools/value-proposition" element={<ValueProposition />} />
                      <Route path="/Tools/ResumeTailor" element={<Navigate to="/tools/resume-tailor" replace />} />
                      <Route path="/tools/resume-tailor" element={<ResumeTailor />} />
                      <Route path="/Tools/AutoFill" element={<Navigate to="/tools/auto-fill" replace />} />
                      <Route path="/tools/auto-fill" element={<FormAutofill />} />
                      <Route path="/Tools/ResumeConsolidator" element={<Navigate to="/tools/resume-consolidator" replace />} />
                      <Route path="/tools/resume-consolidator" element={<ResumeConsolidator />} />
                      <Route path="/tools/xyz-resume-review" element={<XyzResumeReview />} />
                      <Route path="/Tools/SkillExtractor" element={<Navigate to="/tools/skill-extractor" replace />} />
                      <Route path="/tools/skill-extractor" element={<SkillExtractor />} />
                      <Route
                        path="/tools/profile-audit"
                        element={<ProfileAudit />}
                      />
                      <Route
                        path="/tools/career-360"
                        element={<Career360 />}
                      />
                      <Route
                        path="/tools/interview-questions"
                        element={<InterviewQuestions />}
                      />
                      <Route
                        path="/tools/interview-templates"
                        element={<InterviewTemplates />}
                      />
                      <Route
                        path="/tools/video-pitch-lab"
                        element={<VideoPitchLab />}
                      />
                      <Route
                        path="/interview-assignments"
                        element={<MyInterviewAssignments />}
                      />
                      <Route
                        path="/interview-assignments/compare"
                        element={<MyInterviewAssignments />}
                      />
                      <Route
                        path="/interview-assignments/:id"
                        element={<MyInterviewAssignments />}
                      />
                      <Route
                        path="/recruit/pipeline"
                        element={<HiringRouteGate><CrossJobPipeline /></HiringRouteGate>}
                      />
                      <Route
                        path="/recruit/live-screens"
                        element={<HiringRouteGate><LiveScreens /></HiringRouteGate>}
                      />
                      <Route
                        path="/recruit/agent"
                        element={<HiringRouteGate><AgentRuns /></HiringRouteGate>}
                      />
                      <Route
                        path="/live-screen/:token"
                        element={<LiveScreenInvite />}
                      />
                      <Route
                        path="/tools/vendor-sync"
                        element={<VendorSync />}
                      />
                      {/* Per-tool detail / SEO page — must come after every
                          specific `/tools/<slug>` route above, otherwise the
                          `:id` param matches first and swallows them. */}
                      <Route
                        path="/tools/:id"
                        element={<ToolDetail />}
                      />
                      <Route path="/tasks" element={<Tasks />} />
                      <Route path="/outreach" element={<Outreach />} />
                      <Route path="/phone" element={<PhoneDashboard />} />
                      {/* My Services hub — see ServicesNav. Each top-level tab is its own route. */}
                      <Route path="/services" element={<ServicesManagement />} />
                      {/* Bookings (gap #1648) — host config + reservation dashboard. */}
                      <Route path="/bookings" element={<BookingsHost />} />
                      <Route path="/book/:handle" element={<BookPage />} />
                      <Route path="/book/:handle/r/:token" element={<ReservationPage />} />
                      <Route path="/services/creator" element={<ServicesManagement />} />
                      {/* Content Creator sub-tabs are URL-driven via CreatorWorkspace
                          (basePath="/services/creator"). Every tab value the workspace
                          knows about needs a matching route so deep-links + tab clicks
                          resolve to the same component. */}
                      <Route path="/services/creator/:subtab" element={<ServicesManagement />} />
                      <Route path="/services/offerings" element={<ServicesManagement />} />
                      <Route path="/services/inquiries" element={<ServicesManagement />} />
                      {/* Gigs marketplace — a tab of the My Services hub (see
                          ServicesNav). Browse/post briefs + bid; detail + create
                          are deep pages under the same prefix. */}
                      <Route path="/services/gigs" element={<GigMarketplace />} />
                      <Route path="/services/gigs/new" element={<GigCreatePage />} />
                      <Route path="/services/gigs/:id" element={<GigDetail />} />
                      {/* Pool list moved to /resumes?tab=sourced (see EntityHubShell
                          + gap #400). The per-candidate detail page stays here for
                          deep-link compatibility with `RecruitCandidateRedirect`. */}
                      <Route
                        path="/services/candidates/:id"
                        element={<HiringRouteGate><RequireVerified><CandidateDetail /></RequireVerified></HiringRouteGate>}
                      />
                      {/* Pitch Decks / Hiring & Onboarding / Scorecards moved
                          to /people/*. Keep redirects alive so deep links from
                          old emails + bookmarks still land. */}
                      <Route
                        path="/services/pitch-decks"
                        element={<HiringRouteGate><Navigate to="/people/pitch-decks" replace /></HiringRouteGate>}
                      />
                      <Route
                        path="/services/pitch-decks/:id"
                        element={<HiringRouteGate><ServicesPitchDeckRedirect /></HiringRouteGate>}
                      />
                      <Route
                        path="/services/hiring"
                        element={<HiringRouteGate><Navigate to="/people/hiring" replace /></HiringRouteGate>}
                      />
                      <Route
                        path="/services/team"
                        element={<HiringRouteGate><Navigate to="/companies?tab=team" replace /></HiringRouteGate>}
                      />
                      <Route
                        path="/services/scorecards"
                        element={<HiringRouteGate><Navigate to="/people/scorecards" replace /></HiringRouteGate>}
                      />
                      {/* Folded into /settings as the Recruiter > Sharing & Branding tab.
                          Keep this redirect alive so deep links from old emails / bookmarks
                          land on the right place — see Settings.tsx remapLegacyTab. */}
                      <Route
                        path="/services/settings"
                        element={<HiringRouteGate><Navigate to="/settings?tab=recruiter-sharing" replace /></HiringRouteGate>}
                      />
                      <Route path="/articles" element={<ArticlesIndex />} />
                      {/* Static segment outranks :authorSlug — a linked-content card's article link (#2312). */}
                      <Route path="/articles/by-id/:id" element={<ArticleByIdRedirect />} />
                      <Route path="/articles/:authorSlug/:slug" element={<ArticleView />} />
                      {/* Folded into the Content Creator workspace as a sub-tab.
                          Keep this redirect for legacy deep-links from emails / docs. */}
                      <Route path="/courses" element={<Navigate to="/services/creator/courses" replace />} />
                      <Route path="/creators" element={<Navigate to="/search?category=creators" replace />} />
                      <Route path="/creators/dashboard" element={<Navigate to="/services" replace />} />
                      {/* Featured Creators discovery landing (#1772) — static
                          segments rank above /creators/:userId in RRv6. */}
                      <Route path="/creators/featured" element={<FeaturedCreators />} />
                      <Route path="/creators/featured/:category" element={<FeaturedCreators />} />
                      <Route path="/creators/:userId" element={<CreatorPublicProfileRedirect />} />
                      <Route path="/marketplace" element={<Navigate to="/search" replace />} />
                      <Route path="/marketplace/templates" element={<Navigate to="/templates" replace />} />
                      <Route path="/marketplace/templates/:templateId" element={<MarketplaceTemplatePreview />} />
                      <Route path="/marketplace/templates/resume/:templateId" element={<LegacyKindedTemplateRedirect />} />
                      <Route path="/marketplace/templates/video/:templateId" element={<LegacyKindedTemplateRedirect />} />
                      <Route path="/marketplace/voices/:voiceCloneId" element={<VoicePublicDetail />} />
                      <Route path="/courses/:authorSlug/:courseSlug" element={<CoursePublicDetail />} />
                      {/* Saved-items surface — courses the user hearted. */}
                      <Route path="/wishlist" element={<Wishlist />} />
                      {/* Learner playback surface — opened from a course
                          page's Continue-learning CTA. Authed-only;
                          self-gates on the requester owning the
                          enrollment row (API 404s otherwise). */}
                      <Route path="/learn/dashboard" element={<RequireAuth><LearnerDashboard /></RequireAuth>} />
                      <Route path="/learn/:enrollmentId" element={<CourseLearner />} />
                      {/* Learner home (#1889, folded into ?tab=learning) +
                          educator classrooms (#1890) live as tabs on /tools,
                          not standalone routes. These redirects keep
                          old/deep links working. */}
                      <Route path="/learning/me" element={<Navigate to="/tools?tab=learning" replace />} />
                      <Route path="/learning/cohorts" element={<Navigate to="/tools?tab=classrooms" replace />} />
                      {/* Paid-course checkout. The public course detail
                          page catches a 402 PAYMENT_REQUIRED from
                          POST /enroll and navigates here; the checkout
                          page mints a course_checkouts row + drives the
                          existing payment provider. */}
                      <Route path="/checkout/course/:courseId" element={<CourseCheckout />} />
                      {/* #1502 — Reviewer inbox. Lists every course
                          status='in_review' assigned to the calling
                          user; SuperAdmin sees the full queue. */}
                      <Route path="/courses/review-queue" element={<CourseReviewQueue />} />
                      {/* Public certificate verification surface — shared
                          via LinkedIn, recruiter emails, etc. The page
                          self-fetches /api/verify/:certNumber and renders
                          either the printable cert or the not-verified
                          state. */}
                      <Route path="/verify/:certNumber" element={<CertificateVerify />} />
                      <Route path="/account" element={<Navigate to="/settings" replace />} />
                      {/* Admin routes — consolidated into grouped tabs, each with
                          in-page `?view=` segments (#2277). One route per group;
                          AdminSection renders the segment pills + active view. */}
                      {ADMIN_GROUPS.map((g) => (
                        <Route
                          key={g.id}
                          path={g.path}
                          element={
                            <AdminLayout>
                              <AdminSection group={g} elements={ADMIN_SECTION_ELEMENTS[g.id]} />
                            </AdminLayout>
                          }
                        />
                      ))}
                      {/* Legacy `/admin/*` paths → consolidated group + `?view=` */}
                      {Object.entries(ADMIN_LEGACY_REDIRECTS).map(([from, to]) => (
                        <Route key={from} path={from} element={<Navigate to={to} replace />} />
                      ))}
                      {/* Admin pages reachable by direct URL only (not in the tab bar) */}
                      <Route path="/admin/points"            element={<AdminLayout><AdminPoints /></AdminLayout>} />
                      <Route path="/admin/help-mappings"     element={<AdminLayout><HelpMappings /></AdminLayout>} />
                      <Route path="/admin/product-dashboard" element={<Navigate to="/admin/dashboard" replace />} />

                      <Route path="/settings" element={<Settings />} />
                      {/* Partner consent screen — self-gates auth (redirects to login) */}
                      <Route path="/connect/authorize" element={<ConnectAuthorize />} />
                      <Route path="/settings/ads"     element={<PaidMediaPage />} />
                      <Route path="/settings/connections" element={<ConnectionsPage />} />
                      <Route path="/superadmin/ads"   element={<SuperAdminPaidMediaPage />} />
                      <Route path="/contributors" element={<Contributors />} />
                      <Route path="/help" element={<Help />} />
                      <Route path="/help/:slug" element={<HelpArticle />} />
                      <Route path="/guides/getting-started" element={<GettingStartedGuide />} />
                      <Route path="/guides/video-best-practices" element={<VideoBestPracticesGuide />} />
                      <Route path="/guides/networking" element={<NetworkingTipsGuide />} />
                      <Route path="/guides/job-search" element={<JobSearchStrategiesGuide />} />
                      <Route path="/guides/tutorials" element={<TutorialsGuide />} />
                      <Route path="/contact" element={<Contact />} />
                      <Route path="/contact-us" element={<Navigate to="/contact" replace />} />
                      <Route
                        path="/privacy-policy"
                        element={<PrivacyPolicy />}
                      />
                      <Route path="/privacy" element={<PrivacyPolicy />} />
                      <Route path="/privacy/opt-out" element={<PrivacyOptOut />} />
                      <Route path="/data-deletion" element={<DataDeletion />} />
                      <Route path="/do-not-sell" element={<Navigate to="/privacy/opt-out" replace />} />
                      <Route path="/security" element={<SecurityPage />} />
                      <Route path="/security/sessions" element={<SecuritySessions />} />
                      <Route
                        path="/insights/privacy-policy"
                        element={<PrivacyPolicy />}
                      />
                      <Route path="/terms" element={<TermsOfService />} />
                      <Route
                        path="/terms-of-service"
                        element={<TermsOfService />}
                      />
                      <Route
                        path="/insights/terms-of-service"
                        element={<TermsOfService />}
                      />
                      <Route
                        path="/insights/terms-of-use"
                        element={<TermsOfService />}
                      />
                      <Route
                        path="/insights/how-to-use-job-match-analysis-tool"
                        element={
                          <Navigate to="/tools/job-resume-match" replace />
                        }
                      />
                      <Route
                        path="/chrome-extension"
                        element={<ChromeExtension />}
                      />
                      <Route
                        path="/insights/how-to-use-job-seeker-chrome-plugin-extension"
                        element={<ChromeExtension />}
                      />
                      <Route path="/cookies" element={<CookiePolicy />} />

                      {/* Embedded Resume Routes - Multiple patterns for backwards compatibility */}
                      <Route
                        path="/embedded-resume/:identifier"
                        element={<EmbeddedResume />}
                      />
                      <Route
                        path="/embedded/resume/:identifier"
                        element={<EmbeddedResume />}
                      />
                      <Route
                        path="/embedded/resumes/:identifier"
                        element={<EmbeddedResume />}
                      />
                      {/* #696 — project-keyed studio embed: works for any
                          public project, including ones with no published
                          render. */}
                      <Route
                        path="/embedded/studio/:projectId"
                        element={<EmbeddedStudioProject />}
                      />

                      {/* Public media watch pages (/m/); /v/ is a permanent alias */}
                      <Route path="/m/ats/:slug" element={<ATSLandingPage />} />
                      <Route path="/m/:videoId" element={<PublicVideoResume />} />
                      <Route path="/v/ats/:slug" element={<LegacyPublicVideoRedirect />} />
                      <Route path="/v/:videoId" element={<LegacyPublicVideoRedirect />} />

                      {/* Async video interview — candidate view */}
                      <Route path="/interview/:token" element={<AsyncInterviewPage />} />

                      {/* Candidate screening portal (magic link) + recruiter authoring */}
                      <Route path="/screening/:token" element={<CandidateScreening />} />
                      <Route path="/services/screening" element={<HiringRouteGate><ScreeningTemplates /></HiringRouteGate>} />

                      {/* Take-home assignment — candidate delivery surface (#1438) */}
                      <Route path="/take-home/:token" element={<TakeHomeDeliveryPage />} />

                      {/* Agency recruiting — unauthenticated reviewer views */}
                      <Route
                        path="/share/candidate-resume/:token"
                        element={<SharedCandidateResume />}
                      />
                      <Route
                        path="/share/pitch-deck/:token"
                        element={<SharedPitchDeck />}
                      />

                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                    </GlobalVerificationGate>

                  </Suspense>

                  <PrintModeBodyAttribute />

                  <GlobalChrome />
                  <PWAInstallPrompt />
                  </ContactPanelProvider>
                  </CommHubProvider>
                  </HeaderFiltersProvider>
                </BrowserRouter>
              </TooltipProvider>
            </AIProvider>
          </CartProvider>
          <PermissionDebuggerPanel />
        </PermissionDebuggerProvider>
        </PersonaPreviewProvider>
      </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

createRoot(document.getElementById("root")).render(<App />);
