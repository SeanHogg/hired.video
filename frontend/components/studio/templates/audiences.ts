// Audience taxonomy for studio templates — single source of truth.
//
// Per the standing DRY rule, both the per-audience landing page (#900,
// `/for/:audience`) and the per-template landing page's "best for" chips
// (#901, `/templates/:slug`) read from this one registry plus the
// `audiences: Audience[]` field on `TemplateDef` (see catalog.tsx).
// Do NOT introduce a parallel `AUDIENCE_TO_TEMPLATES` map — filter the
// catalog directly: `TEMPLATE_CATALOG.filter(t => t.audiences.includes(id))`.
//
// Podcaster + educator landed alongside the Phase 2 podcast templates
// (#894 / docs/prd/studio-media-kinds.md §3). voice_actor and animator
// remain deferred to their respective Phase 4 / Phase 5 template entries —
// they keep this list anchored to populated audiences (no empty-state
// landings).

export type Audience =
  | "athlete"
  | "actor"
  | "director"
  | "musician"
  | "creator"
  | "job_seeker"
  | "recruiter"
  | "employer"
  | "founder"
  | "developer"
  | "designer"
  | "data_analyst"
  | "podcaster"
  | "educator";

export interface AudienceDef {
  id: Audience;
  /** Plural display label for chips / pills / filter buttons. */
  label: string;
  /** Short descriptor for tooltips, hovercards, and search filter rows.
   *  Hero copy for /for/:audience landing pages is added by #900 — a
   *  separate `heroCopy` field will join this registry then, not a
   *  parallel structure. */
  blurb: string;
}

export const AUDIENCES: AudienceDef[] = [
  {
    id: "athlete",
    label: "Athletes",
    blurb: "Sports talent — recruit reels, season highlights, training breakdowns.",
  },
  {
    id: "actor",
    label: "Actors",
    blurb: "Self-tapes, monologues, and showreels for casting submissions.",
  },
  {
    id: "director",
    label: "Directors",
    blurb: "Treatment pitches, casting calls, and DP / cinematographer reels.",
  },
  {
    id: "musician",
    label: "Musicians",
    blurb: "Performance reels and beat-cut highlights from your best sets.",
  },
  {
    id: "creator",
    label: "Creators",
    blurb: "Independent content creators promoting capabilities, projects, or an audience.",
  },
  {
    id: "job_seeker",
    label: "Job seekers",
    blurb: "Video resumes, skills demos, and personal-brand pitches that hiring managers actually watch.",
  },
  {
    id: "recruiter",
    label: "Recruiters",
    blurb: "Job ads, talent-pool promos, and outreach video for candidate engagement.",
  },
  {
    id: "employer",
    label: "Employers",
    blurb: "Company promos, hiring spots, and employer-brand content for recruiting at scale.",
  },
  {
    id: "founder",
    label: "Founders",
    blurb: "Startup pitches, product launches, and tool demos — the founder telling the story.",
  },
  {
    id: "developer",
    label: "Developers",
    blurb: "Code walkthroughs, architecture explainers, and open-source project demos.",
  },
  {
    id: "designer",
    label: "Designers",
    blurb: "Portfolio walkthroughs, case studies, and process reels for product / brand / motion work.",
  },
  {
    id: "data_analyst",
    label: "Data analysts",
    blurb: "Insight presentations, chart walkthroughs, and methodology demos with the data front-and-centre.",
  },
  {
    id: "podcaster",
    label: "Podcasters",
    blurb: "Episode trailers, full-show recordings, and chapter-marked exports for every podcast platform.",
  },
  {
    id: "educator",
    label: "Educators",
    blurb: "Course trailers, lesson openers, and explainer episodes that meet learners on audio or video.",
  },
];

export const AUDIENCE_BY_ID: Record<Audience, AudienceDef> = Object.fromEntries(
  AUDIENCES.map((a) => [a.id, a]),
) as Record<Audience, AudienceDef>;

export function getAudience(id: Audience): AudienceDef {
  return AUDIENCE_BY_ID[id];
}
