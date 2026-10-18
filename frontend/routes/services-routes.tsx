// My Services hub, bookings, articles, creators, marketplace + course routes
// (fourth block of the app route table — routes/index.tsx keeps the order).
import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { HiringRouteGate } from "@/components/routing/HiringRouteGate";
import { RequireAuth, RequireVerified } from "@/components/routing/RouteGuards";
import {
  CreatorPublicProfileRedirect,
  LegacyKindedTemplateRedirect,
  ServicesPitchDeckRedirect,
} from "@/components/routing/ParamRedirects";

const FeaturedCreators = lazy(() => import("@/pages/FeaturedCreators"));
const GigMarketplace = lazy(() => import("@/pages/GigMarketplace"));
const GigCreatePage = lazy(() => import("@/pages/GigCreatePage"));
const GigDetail = lazy(() => import("@/pages/GigDetail"));
const MarketplaceTemplatePreview = lazy(() => import("@/pages/MarketplaceTemplatePreview"));
const VoicePublicDetail = lazy(() => import("@/pages/marketplace/VoicePublicDetail"));
const CoursePublicDetail = lazy(() => import("@/pages/marketplace/CoursePublicDetail"));
const CourseLearner = lazy(() => import("@/pages/CourseLearner"));
const LearnerDashboard = lazy(() => import("@/pages/LearnerDashboard"));
const CourseCheckout = lazy(() => import("@/pages/CourseCheckout"));
const CourseReviewQueue = lazy(() => import("@/pages/CourseReviewQueue"));
const Wishlist = lazy(() => import("@/pages/Wishlist"));
const CertificateVerify = lazy(() => import("@/pages/CertificateVerify"));
const ServicesManagement = lazy(() => import("@/pages/ServicesManagement"));
const BookPage = lazy(() => import("@/pages/bookings/BookPage"));
const ReservationPage = lazy(() => import("@/pages/bookings/ReservationPage"));
const BookingsHost = lazy(() => import("@/pages/bookings/BookingsHost"));
const ArticlesIndex = lazy(() => import("@/pages/ArticlesIndex"));
const ArticleView = lazy(() => import("@/pages/ArticleView"));
const ArticleByIdRedirect = lazy(() => import("@/components/article/ArticleByIdRedirect"));
const CandidateDetail = lazy(() => import("@/pages/services/CandidateDetail"));

export const servicesRoutes = (
  <>
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
  </>
);
