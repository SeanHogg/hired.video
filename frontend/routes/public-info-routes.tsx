// Settings, help/guides, legal, embeds, public media + tokenized share routes
// (last block before the catch-all — routes/index.tsx keeps the order).
import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { HiringRouteGate } from "@/components/routing/HiringRouteGate";

const CookiePolicy = lazy(() => import("@/pages/CookiePolicy"));
const Settings = lazy(() => import("@/pages/Settings"));
const PaidMediaPage = lazy(() => import("@/pages/paid-media/PaidMediaPage"));
const SuperAdminPaidMediaPage = lazy(() => import("@/pages/paid-media/SuperAdminPaidMediaPage"));
const ConnectionsPage = lazy(() => import("@/pages/settings/Connections"));
const Contributors = lazy(() => import("@/pages/Contributors"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const Help = lazy(() => import("@/pages/Help"));
const HelpArticle = lazy(() => import("@/pages/HelpArticle"));
const GettingStartedGuide = lazy(() => import("@/pages/guides/GettingStarted"));
const VideoBestPracticesGuide = lazy(() => import("@/pages/guides/VideoBestPractices"));
const NetworkingTipsGuide = lazy(() => import("@/pages/guides/NetworkingTips"));
const JobSearchStrategiesGuide = lazy(() => import("@/pages/guides/JobSearchStrategies"));
const TutorialsGuide = lazy(() => import("@/pages/guides/Tutorials"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const PrivacyOptOut = lazy(() => import("@/pages/PrivacyOptOut"));
const DataDeletion = lazy(() => import("@/pages/DataDeletion"));
const SecurityPage = lazy(() => import("@/pages/Security"));
const SecuritySessions = lazy(() => import("@/pages/SecuritySessions"));
const Contact = lazy(() => import("@/pages/Contact"));
const ChromeExtension = lazy(() => import("@/pages/ChromeExtension"));
const ATSLandingPage = lazy(() => import("@/pages/studio/ATSLandingPage"));
const AsyncInterviewPage = lazy(() => import("@/pages/studio/AsyncInterviewPage"));
const TakeHomeDeliveryPage = lazy(() => import("@/pages/TakeHomeDeliveryPage"));
const PublicVideoResume = lazy(() => import("@/pages/PublicVideoResume"));
const LegacyPublicVideoRedirect = lazy(() => import("@/pages/LegacyPublicVideoRedirect"));
const EmbeddedResume = lazy(() => import("@/pages/EmbeddedResume"));
const ConnectAuthorize = lazy(() => import("@/pages/ConnectAuthorize"));
const EmbeddedStudioProject = lazy(() => import("@/pages/EmbeddedStudioProject"));
const SharedCandidateResume = lazy(() => import("@/pages/SharedCandidateResume"));
const CandidateVideoConsent = lazy(() => import("@/pages/CandidateVideoConsent"));
const SharedPitchDeck = lazy(() => import("@/pages/SharedPitchDeck"));
const ScreeningTemplates = lazy(() => import("@/pages/services/ScreeningTemplates"));
const CandidateScreening = lazy(() => import("@/pages/CandidateScreening"));

export const publicInfoRoutes = (
  <>
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

    {/* Candidate video consent — the candidate answers a recruiter's
        ask by the tokenized email link (unauthenticated). */}
    <Route path="/consent/video/:token" element={<CandidateVideoConsent />} />

    {/* Agency recruiting — unauthenticated reviewer views */}
    <Route
      path="/share/candidate-resume/:token"
      element={<SharedCandidateResume />}
    />
    <Route
      path="/share/pitch-deck/:token"
      element={<SharedPitchDeck />}
    />
  </>
);
