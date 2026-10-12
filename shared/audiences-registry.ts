/**
 * Life-stage audience registry — single source of truth for what each
 * `/for/[audience]` landing page renders. Mapped 1:1 to LIFE_STAGE_AUDIENCES
 * from shared/audiences.ts so adding a new audience requires touching one
 * registry entry, not N components.
 *
 * Per the DRY rule + [feedback_role_means_user_role] — feature eligibility
 * comes from the user-role enum elsewhere; this registry only **orders +
 * emphasizes** the existing feature set, never invents a new gate.
 *
 * Per #1629 / Resource Maps spec.
 */
import type { LifeStageAudience } from "./audiences.js";
import { isPersonaEnabled, type UserRole } from "./user-roles.js";
import type { ContentLocationKind } from "./content-locations.js";
import { STUDIO_NEW_JOB_PATH } from "./studio-paths.js";

/** A single feature shown in <ToolShowcase> tabs. The key matches a
 *  known page/feature on hired.video so the CTA goes somewhere real;
 *  unknown keys are skipped at render time. */
export interface AudienceFocusFeature {
  /** Stable id used by the showcase + analytics. Matches the feature's
   *  canonical name (`studio`, `skill_network`, `resume_builder`, …). */
  key: string;
  label: string;
  blurb: string;
  href: string;
}

export interface AudienceCTA {
  label: string;
  href: string;
}

export interface LifeStageAudienceMeta {
  key: LifeStageAudience;
  label: string;
  /** Short pain-point sentence under the hero. */
  thesis: string;
  /** Anchors role-tagged feature eligibility — only features tagged with
   *  this role surface for this audience. Per [feedback_role_means_user_role]. */
  primaryRole: UserRole;
  /** Ordered emphasis — first 3-5 surface in <ToolShowcase> tabs. */
  focusFeatures: AudienceFocusFeature[];
  /** Ordered ResourceMap bucket priority — buckets render in this order;
   *  empty buckets self-hide. */
  focusContentKinds: ContentLocationKind[];
  ctaSecondary: AudienceCTA;
}

/** Common feature catalog reused by multiple audiences — keeps duplication
 *  out of the per-audience focus arrays. Touch a label / href here, every
 *  audience that references it updates in lockstep. */
const FEATURES = {
  resumeBuilder: {
    key: "resume_builder",
    label: "Resume builder",
    blurb: "Section-aware editor + AI scorer; clone from any public template.",
    href: "/resumes",
  } satisfies AudienceFocusFeature,
  studio: {
    key: "studio",
    label: "Studio video",
    blurb: "Build a video resume, intro reel, or available-now video — no editing chops needed.",
    href: "/studio",
  } satisfies AudienceFocusFeature,
  skillNetwork: {
    key: "skill_network",
    label: "Skill Network",
    blurb: "Visualize transferable skills and how they connect to opportunities.",
    href: "/pivot-explorer",
  } satisfies AudienceFocusFeature,
  learningPaths: {
    key: "learning_paths",
    label: "Learning paths",
    blurb: "Certifications + courses to bridge into a new role or refresh expertise.",
    href: "/learning",
  } satisfies AudienceFocusFeature,
  coffeeChats: {
    key: "coffee_chats",
    label: "Coffee chats",
    blurb: "Warm-intro 1:1 networking — same surface for mentorship, advisory, and outreach.",
    href: "/network/warm-intros",
  } satisfies AudienceFocusFeature,
  gamification: {
    key: "gamification",
    label: "Streaks + rewards",
    blurb: "Daily-apply streaks, badges, and gift-card cashout — momentum when you need it most.",
    href: "/points",
  } satisfies AudienceFocusFeature,
  outreach: {
    key: "outreach",
    label: "Outreach campaigns",
    blurb: "Mass-apply with templated messages; inbox tracks replies + follow-ups.",
    href: "/outreach",
  } satisfies AudienceFocusFeature,
  jobBoard: {
    key: "job_board",
    label: "Job board",
    blurb: "Filtered, region-aware, employer-verified.",
    href: "/jobs",
  } satisfies AudienceFocusFeature,
  jobPosting: {
    key: "job_posting",
    label: "Post a job",
    blurb: "Reach candidates with rich job posts + sourcing marketplace.",
    href: STUDIO_NEW_JOB_PATH,
  } satisfies AudienceFocusFeature,
  candidateSearch: {
    key: "candidate_search",
    label: "Candidate search",
    blurb: "Filter by skills, location, video resume + AI-ranked matches.",
    href: "/recruit",
  } satisfies AudienceFocusFeature,
  peopleOps: {
    key: "people_ops",
    label: "People Operations",
    blurb: "Roster, org chart, 1:1s, and team-health analytics — the back-office after the hire.",
    href: "/people/roster",
  } satisfies AudienceFocusFeature,
  biddingMarketplace: {
    key: "bidding_marketplace",
    label: "Sourcing bids",
    blurb: "Bid on company-posted sourcing requests; get paid per qualified placement.",
    href: "/sourcing/browse",
  } satisfies AudienceFocusFeature,
  gigMarketplace: {
    key: "gig_marketplace",
    label: "Gig marketplace",
    blurb: "Post or bid on freelance projects with milestone escrow — get paid as you deliver.",
    href: "/services/gigs",
  } satisfies AudienceFocusFeature,
  profile: {
    key: "profile",
    label: "Profile + portfolio",
    blurb: "Public profile becomes your channel — articles, video, skills, projects.",
    href: "/profile",
  } satisfies AudienceFocusFeature,
  articles: {
    key: "articles",
    label: "Articles + thought leadership",
    blurb: "Publish long-form to build authority; surfaced on your profile + the public feed.",
    href: "/articles",
  } satisfies AudienceFocusFeature,
  confidentialSearch: {
    key: "confidential_search",
    label: "Confidential search",
    blurb: "Stay invisible in the public directory while you explore — built for execs who are still employed. Toggle in Settings → Privacy.",
    href: "/settings?tab=privacy",
  } satisfies AudienceFocusFeature,
  retainedSearch: {
    key: "retained_search",
    label: "Retained search directory",
    blurb: "The retained executive-search firms that fill C-suite + board roles — browse by tier and specialty.",
    href: "/retained-search",
  } satisfies AudienceFocusFeature,
  compAnalyzer: {
    key: "comp_analyzer",
    label: "Comp analyzer",
    blurb: "Break a total-comp offer into base + bonus + equity + sign-on — compare offers on annualized total, not base.",
    href: "/tools/comp-analyzer",
  } satisfies AudienceFocusFeature,
} as const;

/** Every audience ever authored, including the hiring-side ones (employers /
 *  recruiters). Kept so turning the persona switch back on restores them
 *  verbatim — consumers read the filtered LIFE_STAGE_AUDIENCE_REGISTRY. */
const ALL_LIFE_STAGE_AUDIENCES_META: LifeStageAudienceMeta[] = [
  // ─── Role pages (live alongside Features.tsx / ForCompanies.tsx) ─────
  {
    key: "job_seekers",
    label: "Job Seekers",
    thesis:
      "Already employed and ready to level up — sharpen your story, expand your network, and signal what's next.",
    primaryRole: "job_seeker",
    focusFeatures: [FEATURES.studio, FEATURES.skillNetwork, FEATURES.coffeeChats, FEATURES.learningPaths, FEATURES.profile],
    focusContentKinds: ["article", "template", "learning_path", "video", "job"],
    ctaSecondary: { label: "Browse jobs", href: "/jobs" },
  },
  {
    key: "employers",
    label: "Employers",
    thesis:
      "Hire faster, build employer brand, and run the back-office. One workspace for posts, candidates, and people-ops.",
    primaryRole: "employer",
    focusFeatures: [FEATURES.jobPosting, FEATURES.candidateSearch, FEATURES.peopleOps, FEATURES.studio, FEATURES.articles],
    focusContentKinds: ["job", "article", "template", "learning_path"],
    ctaSecondary: { label: "Talk to sales", href: "/contact" },
  },
  {
    key: "recruiters",
    label: "Recruiters",
    thesis:
      "Source, bid, and place — placement-driven income on the same surface companies post sourcing requests.",
    primaryRole: "recruiter",
    focusFeatures: [FEATURES.biddingMarketplace, FEATURES.outreach, FEATURES.candidateSearch, FEATURES.gamification],
    focusContentKinds: ["job", "article", "template"],
    ctaSecondary: { label: "How bidding works", href: "/for-recruiters" },
  },

  // ─── Life-stage audiences (NEW per #1629) ────────────────────────────
  {
    key: "recent_graduates",
    label: "Recent Graduates",
    thesis:
      "0-2 years out, no work history to lean on. Differentiate with a video resume, ship projects, and apply faster.",
    primaryRole: "job_seeker",
    focusFeatures: [FEATURES.studio, FEATURES.resumeBuilder, FEATURES.learningPaths, FEATURES.gamification, FEATURES.jobBoard],
    focusContentKinds: ["template", "video", "article", "learning_path", "job"],
    // Studio deep-links use `?contentTemplate=` — the param StudioLayout's
    // bootstrap + the anon editor (#2212) actually read. `?audience=<slug>`
    // was a silent no-op (the studio has no life-stage audience filter).
    ctaSecondary: { label: "Entry-level jobs", href: "/jobs?experienceLevel=entry" },
  },
  {
    key: "students",
    label: "College & University Students",
    thesis:
      "Internships, class projects, and the network you'll lean on after graduation — build the portfolio now.",
    primaryRole: "job_seeker",
    focusFeatures: [FEATURES.studio, FEATURES.profile, FEATURES.coffeeChats, FEATURES.learningPaths, FEATURES.jobBoard],
    focusContentKinds: ["template", "learning_path", "article", "video", "job"],
    ctaSecondary: { label: "Build a project reel", href: "/studio/new?contentTemplate=skills-demo" },
  },
  {
    key: "unemployed",
    label: "Between Jobs",
    thesis:
      "Out of work, momentum at risk. Apply velocity + outreach + small daily wins to keep the search moving.",
    primaryRole: "job_seeker",
    focusFeatures: [FEATURES.resumeBuilder, FEATURES.outreach, FEATURES.gamification, FEATURES.studio, FEATURES.jobBoard],
    focusContentKinds: ["article", "template", "video", "job", "learning_path"],
    ctaSecondary: { label: "Build a strong resume", href: "/resumes" },
  },
  {
    key: "layoff_recovery",
    label: "After a Layoff",
    thesis:
      "Severance window + healthcare + insurance + apply velocity — the acute version of the search.",
    primaryRole: "job_seeker",
    focusFeatures: [FEATURES.outreach, FEATURES.gamification, FEATURES.studio, FEATURES.resumeBuilder, FEATURES.jobBoard],
    focusContentKinds: ["article", "template", "job", "video", "learning_path"],
    // `/articles` filters on `?audience=<ArticleAudience>` (job_seeker/recruiter/
    // pivot/resume_guide/civic) + `?sector=` — there is no `?topic=` param, so
    // the old `?topic=layoff-recovery` was a no-op. Point at the populated
    // job-seeker career-guidance filter (the closest real surface).
    ctaSecondary: { label: "Start applying", href: "/jobs" },
  },
  {
    key: "career_changers",
    label: "Career Changers",
    thesis:
      "Pivot industries by reframing transferable skills and telling a new story — resume, video, and certs in one place.",
    primaryRole: "job_seeker",
    focusFeatures: [FEATURES.skillNetwork, FEATURES.resumeBuilder, FEATURES.studio, FEATURES.learningPaths, FEATURES.coffeeChats],
    focusContentKinds: ["article", "learning_path", "template", "video", "job"],
    ctaSecondary: { label: "Browse cert paths", href: "/learning" },
  },
  {
    key: "returning_to_workforce",
    label: "Returning to Work",
    thesis:
      "Re-entry after caregiving, sabbatical, or a long break. Reframe the gap, refresh skills, target flexible roles.",
    primaryRole: "job_seeker",
    focusFeatures: [FEATURES.resumeBuilder, FEATURES.studio, FEATURES.coffeeChats, FEATURES.learningPaths, FEATURES.jobBoard],
    focusContentKinds: ["article", "template", "learning_path", "job", "video"],
    ctaSecondary: { label: "Flexible roles", href: "/jobs?isRemote=true" },
  },
  {
    key: "veterans",
    label: "Veterans & Military Transition",
    thesis:
      "Translate military experience into civilian language, get cert credit where it counts, find veteran-friendly employers.",
    primaryRole: "job_seeker",
    focusFeatures: [FEATURES.skillNetwork, FEATURES.resumeBuilder, FEATURES.learningPaths, FEATURES.studio, FEATURES.jobBoard],
    focusContentKinds: ["article", "learning_path", "template", "job", "video"],
    ctaSecondary: { label: "Veteran-friendly jobs", href: "/jobs" },
  },
  {
    key: "gig_economy",
    label: "Gig Economy & Freelancers",
    thesis:
      "Portfolio-led work — contract, freelance, fractional. Bid on gigs, deliver against milestone escrow, and let your profile bring the next one in.",
    primaryRole: "job_seeker",
    focusFeatures: [FEATURES.gigMarketplace, FEATURES.studio, FEATURES.profile, FEATURES.outreach, FEATURES.jobBoard],
    focusContentKinds: ["template", "video", "article", "job", "learning_path"],
    ctaSecondary: { label: "Build a portfolio reel", href: "/studio/new?contentTemplate=design-portfolio" },
  },
  {
    key: "international_job_seekers",
    label: "International Job Seekers",
    thesis:
      "Visa sponsorship, foreign credential recognition, region-aware content — land work across borders.",
    primaryRole: "job_seeker",
    focusFeatures: [FEATURES.resumeBuilder, FEATURES.learningPaths, FEATURES.studio, FEATURES.coffeeChats, FEATURES.jobBoard],
    focusContentKinds: ["article", "learning_path", "template", "job", "video"],
    ctaSecondary: { label: "Visa-friendly employers", href: "/jobs" },
  },
  {
    key: "early_career",
    label: "Early Career & Bootcamp",
    thesis:
      "Pre-college, bootcamp, or self-taught path. Heavy on projects, certs, and visibility — let the work do the talking.",
    primaryRole: "job_seeker",
    focusFeatures: [FEATURES.learningPaths, FEATURES.studio, FEATURES.gamification, FEATURES.coffeeChats, FEATURES.jobBoard],
    focusContentKinds: ["learning_path", "template", "article", "job", "video"],
    ctaSecondary: { label: "Entry-level roles", href: "/jobs?experienceLevel=entry" },
  },
  {
    key: "senior_executives",
    label: "Senior Executives",
    thesis:
      "Confidential search while you're still employed, exec brand, warm intros, and thought leadership. Board seats + fractional roles coming next.",
    primaryRole: "job_seeker",
    focusFeatures: [FEATURES.confidentialSearch, FEATURES.retainedSearch, FEATURES.compAnalyzer, FEATURES.studio, FEATURES.articles],
    focusContentKinds: ["article", "video", "template", "job", "learning_path"],
    ctaSecondary: { label: "Executive roles", href: "/jobs?experienceLevel=executive" },
  },
];

/** Audiences whose persona is currently offered (pure, testable). */
export function enabledLifeStageAudiences(
  hiringEnabled?: boolean,
): LifeStageAudienceMeta[] {
  return ALL_LIFE_STAGE_AUDIENCES_META.filter((m) =>
    isPersonaEnabled(m.primaryRole, hiringEnabled),
  );
}

/** The live registry. Order in this array drives /for/index display order.
 *  Hiring-side audiences (primaryRole recruiter / employer) drop out while
 *  HIRING_PERSONAS_ENABLED is off, so /for, the audience link rails and
 *  /for/employers|recruiters (→ redirect to /for) all follow the switch. */
export const LIFE_STAGE_AUDIENCE_REGISTRY: LifeStageAudienceMeta[] = enabledLifeStageAudiences();

const REGISTRY_BY_KEY = new Map<LifeStageAudience, LifeStageAudienceMeta>(
  LIFE_STAGE_AUDIENCE_REGISTRY.map((m) => [m.key, m]),
);

export function lifeStageAudienceMeta(
  key: LifeStageAudience,
): LifeStageAudienceMeta | null {
  return REGISTRY_BY_KEY.get(key) ?? null;
}
