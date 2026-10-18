// Jobs, companies, people/CHRO, events and sector routes (second block of
// the app route table — routes/index.tsx keeps the original order).
import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { HiringRouteGate } from "@/components/routing/HiringRouteGate";
import { RequireVerified } from "@/components/routing/RouteGuards";
import {
  GigDetailRedirect,
  RecruitCandidateRedirect,
  RecruitPitchDeckRedirect,
} from "@/components/routing/ParamRedirects";

const Companies = lazy(() => import("@/pages/Companies"));
const CompanyDetail = lazy(() => import("@/pages/CompanyDetail"));
const CompanyReviewsPage = lazy(() => import("@/pages/CompanyReviewsPage"));
const People = lazy(() => import("@/pages/People"));
const Jobs = lazy(() => import("@/pages/Jobs"));
const SearchPage = lazy(() => import("@/pages/Search"));
// Shared with tools-routes (/live-screen/:token) so both paths render the
// same lazy component identity.
export const LiveScreenInvite = lazy(() => import("@/pages/LiveScreenInvite"));
const SourcingBrowse = lazy(() => import("@/pages/SourcingBrowse"));
const TranscriptSearch = lazy(() => import("@/pages/TranscriptSearch"));
const HiringManagerPortal = lazy(() => import("@/pages/HiringManagerPortal"));
const AffiliateProgram = lazy(() => import("@/pages/AffiliateProgram"));
const LearningPlatform = lazy(() => import("@/pages/LearningPlatform"));
const LearningPortability = lazy(() => import("@/pages/LearningPortability"));
// CHRO People Operations (hired-video extraction): marketing landing +
// the paid in-app roster / 1:1s surfaces.
const PeopleOperations = lazy(() => import("@/pages/PeopleOperations"));
const PeopleRoster = lazy(() => import("@/pages/people/PeopleRoster"));
const PeopleOneOnOnes = lazy(() => import("@/pages/people/PeopleOneOnOnes"));
const PeopleGoals = lazy(() => import("@/pages/people/PeopleGoals"));
const PeopleOpsHub = lazy(() => import("@/pages/people/PeopleOpsHub"));
const PeopleSurface = lazy(() => import("@/pages/people/PeopleSurface"));
const PeopleTeamHealth = lazy(() => import("@/pages/people/PeopleTeamHealth"));
const PeopleTco = lazy(() => import("@/pages/people/PeopleTco"));
// `/events` (discovery index) and `/map` were consolidated into
// `/tasks` (see Tasks.tsx Discover surface). Sub-pages stay on their
// own URLs because they're per-event detail surfaces, not the
// discovery list.
const EventDetail = lazy(() => import("@/pages/EventDetail"));
const EventNew = lazy(() => import("@/pages/EventNew"));
const EventManage = lazy(() => import("@/pages/EventManage"));
const SectorsIndex = lazy(() => import("@/pages/SectorsIndex"));
const SectorLanding = lazy(() => import("@/pages/SectorLanding"));
const ResumeTemplatesGallery = lazy(() => import("@/pages/ResumeTemplatesGallery"));
const PivotExplorer = lazy(() => import("@/pages/PivotExplorer"));
const JobDetail = lazy(() => import("@/pages/JobDetail"));
// Job create / edit retired into the Studio (lib/routing/legacy-redirects.ts);
// the dedicated screening route hosts the structured screening builder.
const JobScreeningPage = lazy(() => import("@/pages/JobScreeningPage"));
const JobApplicationPage = lazy(() => import("@/pages/JobApplicationPage"));
const JobEmbed = lazy(() => import("@/pages/JobEmbed"));
const TemplatesReview = lazy(() => import("@/pages/admin/TemplatesReview"));
const BdPipeline = lazy(() => import("@/pages/recruiter/BdPipeline"));
const TakeHomeAssignment = lazy(() => import("@/pages/TakeHomeAssignment"));
const PeopleDetail = lazy(() => import("@/pages/PeopleDetail"));
const PitchDecksList = lazy(() => import("@/pages/services/PitchDecksList"));
const PitchDeckBuilder = lazy(() => import("@/pages/services/PitchDeckBuilder"));
const HiringOnboarding = lazy(() => import("@/pages/services/HiringOnboarding"));
const ScorecardsPage = lazy(() => import("@/pages/services/ScorecardsPage"));

export const jobsPeopleRoutes = (
  <>
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
  </>
);
