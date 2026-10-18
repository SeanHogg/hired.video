// Core + marketing + résumé/studio routes (first block of the app route table).
// Order matters only for readability — routes/index.tsx concatenates every
// block in the original table order.
import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { HiringRouteGate } from "@/components/routing/HiringRouteGate";
import { RequireAuth, RequireVerified, ProfileRedirect } from "@/components/routing/RouteGuards";
import { LegacyViewerRedirect, LegacySampleRedirect } from "@/components/routing/ParamRedirects";
import LegacyRedirect from "@/components/routing/LegacyRedirect";
import { LEGACY_REDIRECTS } from "@/lib/routing/legacy-redirects";
import { TOOL_PAGES } from "@/components/tools/tool-pages";

// Critical pages (loaded immediately)
import Index from "@/pages/Index";
import PersonaSelection from "@/pages/PersonaSelection";
// Auth pages (keep immediate for better UX)
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import ConfirmEmail from "@/pages/ConfirmEmail";
import VerifyEmail from "@/pages/VerifyEmail";
import OAuthCallback from "@/pages/OAuthCallback";
import MagicLinkVerify from "@/pages/MagicLinkVerify";
import TwoFactorApprove from "@/pages/TwoFactorApprove";
import SignupSuccess from "@/pages/SignupSuccess";
import AcceptInvitation from "@/pages/AcceptInvitation";

// Lazy load non-critical pages
const PlacementDetail = lazy(() => import("@/pages/recruiter/PlacementDetail"));
const TeamActivities = lazy(() => import("@/pages/TeamActivities"));
const IntegrationOAuthCallback = lazy(() => import("@/pages/IntegrationOAuthCallback"));
const PlacementsList = lazy(() => import("@/pages/recruiter/PlacementsList"));
const ForAgencies = lazy(() => import("@/pages/ForAgencies"));
const WorkforceGuide = lazy(() => import("@/pages/guides/WorkforceGuide"));
const BlogIndex = lazy(() => import("@/pages/blog/BlogIndex"));
const BlogPost = lazy(() => import("@/pages/blog/BlogPost"));
const SalaryPage = lazy(() => import("@/pages/seo/SalaryPage"));
const PlayInvite = lazy(() => import("@/pages/PlayInvite"));
const SalaryIndexPage = lazy(() => import("@/pages/seo/SalaryIndexPage"));
const ResumeGuidePage = lazy(() => import("@/pages/seo/ResumeGuidePage"));
const About = lazy(() => import("@/pages/About"));
const Careers = lazy(() => import("@/pages/Careers"));
const Home = lazy(() => import("@/pages/Home"));
const ForRecruiters = lazy(() => import("@/pages/ForRecruiters"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Features = lazy(() => import("@/pages/Features"));
const Competitors = lazy(() => import("@/pages/Competitors"));
const AudienceLandingPage = lazy(() => import("@/pages/landing/AudienceLandingPage"));
const ForIndex = lazy(() => import("@/pages/ForIndex"));
const LocationLandingPage = lazy(() => import("@/pages/landing/LocationLandingPage"));
const SitemapLocations = lazy(() => import("@/pages/SitemapLocations"));
const AdminAudienceTagger = lazy(() => import("@/pages/admin/AdminAudienceTagger"));
const RetainedSearchDirectory = lazy(() => import("@/pages/RetainedSearchDirectory"));
const References = lazy(() => import("@/pages/References"));
const ReferencesShared = lazy(() => import("@/pages/ReferencesShared"));
const WarmIntros = lazy(() => import("@/pages/WarmIntros"));
const TemplateLandingPage = lazy(() => import("@/pages/landing/TemplateLandingPage"));
const TemplatesPage = lazy(() => import("@/pages/Templates"));
const Resumes = lazy(() => import("@/pages/Resumes"));
const EmailPreferences = lazy(() => import("@/pages/EmailPreferences"));
const InterviewPractice = lazy(() => import("@/pages/InterviewPractice"));
// /profile is now a redirect to the canonical /people/:id — see route below.
const ResumeDetail = lazy(() => import("@/pages/ResumeDetail"));
const ResumeReviewPage = lazy(() => import("@/pages/ResumeReviewPage"));
const FeedRoute = lazy(() => import("@/components/feed/FeedRoute"));
const PostDetail = lazy(() => import("@/pages/PostDetail"));
const PointsPage = lazy(() => import("@/pages/Points"));
const RewardsPage = lazy(() => import("@/pages/Rewards"));
const Studio = lazy(() => import("@/pages/studio/Studio"));
const StudioWorkspace = lazy(() => import("@/pages/studio/StudioWorkspace"));
const DistributionHub = lazy(() => import("@/pages/studio/distribution/DistributionHub"));
const PublicProfile = lazy(() => import("@/pages/PublicProfile"));
const ResumeRoast = TOOL_PAGES["resume-roast"];

export const coreRoutes = (
  <>
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
  </>
);
