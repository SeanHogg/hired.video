// Audience taxonomy for studio templates — single source of truth.
//
// Per the standing DRY rule, both the per-audience landing page (#900,
// `/for/:audience`) and the per-template landing page's "best for" chips
// (#901, `/templates/:slug`) read from this one registry plus the
// `audiences: Audience[]` field on `TemplateDef` (see catalog.ts).
// Do NOT introduce a parallel `AUDIENCE_TO_TEMPLATES` map — filter the
// catalog directly: `TEMPLATE_CATALOG.filter(t => t.audiences.includes(id))`.
//
// Podcaster + educator landed alongside the Phase 2 podcast templates.
// voice_actor landed alongside the Phase 4 voice templates. animator
// lands here with the Phase 5 animation templates (#1003 / #1013).
//
// Persona switch: the hiring-side audiences (recruiter / employer — ids that
// equal their USER_ROLES value) drop out of the LIVE registry (`AUDIENCES`,
// `AUDIENCE_BY_ID`) while HIRING_PERSONAS_ENABLED is off, mirroring
// `enabledLifeStageAudiences` in shared/audiences-registry.ts. Chips, the
// /for/:audience resolver and the sitemap test all read the live registry;
// `getAudience` stays a full-catalog lookup for templates tagged with a
// gated audience. Flip the switch and everything comes back.
//
// Each entry is also THE registry for its landing page (#2364 / #922): hero
// copy, hero imagery, which real proof to show, and the create intent its
// upload step and the studio default to. The sitemap's /for/ and
// /templates/ entries are generated from this registry + TEMPLATE_CATALOG
// at build time (scripts/generate-sitemap.mjs, #920).

import { isPersonaEnabled } from "@shared/user-roles";
import type { CreateIntent } from "@/lib/studio/create-intent";

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
  | "educator"
  | "voice_actor"
  | "game_dev"
  | "illustrator"
  | "animator"
  | "cad_user";

/** The hero composition a /for/:audience page draws (token-only art in
 *  components/landing/AudienceHeroArt.tsx): a paper résumé becoming videos,
 *  a reel of the audience's formats, or a brand card becoming a job video. */
export type AudienceHeroArt = "resume" | "reel" | "brand";

/** REAL proof a /for/:audience page may show — never an invented figure.
 *  `builders`: the live site-wide résumé count (self-hides below its floor);
 *  `templates`: how many catalog templates are made for this audience. */
export type AudienceProof = "builders" | "templates";

export interface AudienceDef {
  id: Audience;
  /** Plural display label for chips / pills / filter buttons. */
  label: string;
  /** Short descriptor for tooltips, hovercards, search filter rows and the
   *  landing page's meta description. */
  blurb: string;
  /** The /for/:audience hero line — the outcome, in the audience's words
   *  (#922). Localized via `audienceProfessions.<id>.heroCopy`. */
  heroCopy: string;
  /** The hero imagery (#922). */
  heroArt: AudienceHeroArt;
  /** Which real proof the landing page shows, in order (#2346). */
  proof: readonly AudienceProof[];
  /** What this audience comes to make — the landing page's upload step and
   *  the studio's default start (#2363 / #2364, lib/studio/create-intent.ts). */
  createIntent: CreateIntent;
}

/** Every audience the studio knows, ungated. Prefer `AUDIENCES`. */
export const ALL_AUDIENCES: AudienceDef[] = [
  {
    id: "athlete",
    label: "Athletes",
    blurb: "Sports talent — recruit reels, season highlights, training breakdowns.",
    heroCopy: "Turn your season into a recruit reel coaches actually finish watching.",
    heroArt: "reel",
    proof: ["templates"],
    createIntent: "video",
  },
  {
    id: "actor",
    label: "Actors",
    blurb: "Self-tapes, monologues, and showreels for casting submissions.",
    heroCopy: "Send casting a self-tape that looks booked, not homemade.",
    heroArt: "reel",
    proof: ["templates"],
    createIntent: "video",
  },
  {
    id: "director",
    label: "Directors",
    blurb: "Treatment pitches, casting calls, and DP / cinematographer reels.",
    heroCopy: "Pitch your vision with a treatment reel that sells the room before you walk in.",
    heroArt: "reel",
    proof: ["templates"],
    createIntent: "video",
  },
  {
    id: "musician",
    label: "Musicians",
    blurb: "Performance reels and beat-cut highlights from your best sets.",
    heroCopy: "Cut your best sets into a reel that lands the next booking.",
    heroArt: "reel",
    proof: ["templates"],
    createIntent: "video",
  },
  {
    id: "creator",
    label: "Creators",
    blurb: "Independent content creators promoting capabilities, projects, or an audience.",
    heroCopy: "Show brands and followers what you make, in one polished video.",
    heroArt: "reel",
    proof: ["templates"],
    createIntent: "video",
  },
  {
    id: "job_seeker",
    label: "Job seekers",
    blurb: "Video resumes, skills demos, and personal-brand pitches that hiring managers actually watch.",
    heroCopy: "Upload your résumé. Leave with a video that gets you seen.",
    heroArt: "resume",
    proof: ["builders", "templates"],
    createIntent: "resume",
  },
  {
    id: "recruiter",
    label: "Recruiters",
    blurb: "Job ads, talent-pool promos, and outreach video for candidate engagement.",
    heroCopy: "Turn every open role into a video candidates stop scrolling for.",
    heroArt: "brand",
    proof: ["templates"],
    createIntent: "job",
  },
  {
    id: "employer",
    label: "Employers",
    blurb: "Company promos, hiring spots, and employer-brand content for recruiting at scale.",
    heroCopy: "Show candidates what it is really like to work with you.",
    heroArt: "brand",
    proof: ["templates"],
    createIntent: "company",
  },
  {
    id: "founder",
    label: "Founders",
    blurb: "Startup pitches, product launches, and tool demos — the founder telling the story.",
    heroCopy: "Tell your startup's story in a pitch video investors and early hires remember.",
    heroArt: "reel",
    proof: ["templates"],
    createIntent: "video",
  },
  {
    id: "developer",
    label: "Developers",
    blurb: "Code walkthroughs, architecture explainers, and open-source project demos.",
    heroCopy: "Upload your résumé, then show the code behind it in a walkthrough video.",
    heroArt: "resume",
    proof: ["builders", "templates"],
    createIntent: "resume",
  },
  {
    id: "designer",
    label: "Designers",
    blurb: "Portfolio walkthroughs, case studies, and process reels for product / brand / motion work.",
    heroCopy: "Upload your résumé, then walk hiring managers through your best work.",
    heroArt: "resume",
    proof: ["builders", "templates"],
    createIntent: "resume",
  },
  {
    id: "data_analyst",
    label: "Data analysts",
    blurb: "Insight presentations, chart walkthroughs, and methodology demos with the data front-and-centre.",
    heroCopy: "Upload your résumé, then let your charts do the talking in a short video.",
    heroArt: "resume",
    proof: ["builders", "templates"],
    createIntent: "resume",
  },
  {
    id: "podcaster",
    label: "Podcasters",
    blurb: "Episode trailers, full-show recordings, and chapter-marked exports for every podcast platform.",
    heroCopy: "Turn every episode into a trailer people actually press play on.",
    heroArt: "reel",
    proof: ["templates"],
    createIntent: "video",
  },
  {
    id: "educator",
    label: "Educators",
    blurb: "Course trailers, lesson openers, and explainer episodes that meet learners on audio or video.",
    heroCopy: "Open every lesson with a video learners want to finish.",
    heroArt: "reel",
    proof: ["templates"],
    createIntent: "video",
  },
  {
    id: "voice_actor",
    label: "Voice actors",
    blurb: "Audition reels, character demos, narration samples, and ID spots — script-driven, voice-clone-friendly.",
    heroCopy: "Build an audition reel that books the next read.",
    heroArt: "reel",
    proof: ["templates"],
    createIntent: "video",
  },
  {
    id: "game_dev",
    label: "Game developers",
    blurb: "Browser-playable game prototypes — endless runners, quizzes, memory games — that publish to itch.io or your own page.",
    heroCopy: "Ship a playable prototype people can try right in the browser.",
    heroArt: "reel",
    proof: ["templates"],
    createIntent: "video",
  },
  {
    id: "illustrator",
    label: "Illustrators",
    blurb: "Comics, drawing canvases, social posts, and OG cards — raster + vector tools with AI generation alongside.",
    heroCopy: "Turn your drawings into comics, posts and cards people share.",
    heroArt: "reel",
    proof: ["templates"],
    createIntent: "video",
  },
  {
    id: "animator",
    label: "Animators",
    blurb: "Frame-by-frame raster animation with onion-skin overlay — logo loops, reaction GIFs, explainer micro-loops exported as GIF / APNG / WebP.",
    heroCopy: "Make loops and GIFs that move exactly the way you pictured them.",
    heroArt: "reel",
    proof: ["templates"],
    createIntent: "video",
  },
  {
    id: "cad_user",
    label: "CAD users",
    blurb: "Architects, mechanical engineers, electrical hobbyists drafting 2D plans + part drawings + schematics in the studio — exports as SVG, DXF, and PDF.",
    heroCopy: "Draft plans and part drawings, then export them clean as SVG, DXF or PDF.",
    heroArt: "reel",
    proof: ["templates"],
    createIntent: "video",
  },
];

/** Is this audience currently offered? Hiring audiences follow the persona
 *  switch (`hiringEnabled` injectable for tests); every other one is live. */
export function isAudienceEnabled(id: Audience, hiringEnabled?: boolean): boolean {
  return isPersonaEnabled(id, hiringEnabled);
}

/** Audiences whose persona is currently offered (pure, testable). */
export function enabledAudiences(hiringEnabled?: boolean): AudienceDef[] {
  return ALL_AUDIENCES.filter((a) => isAudienceEnabled(a.id, hiringEnabled));
}

/** The live registry — chips, /for/:audience and the sitemap read this. */
export const AUDIENCES: AudienceDef[] = enabledAudiences();

/** Live inverse index; gated audiences are absent while their persona is off. */
export const AUDIENCE_BY_ID: Partial<Record<Audience, AudienceDef>> = Object.fromEntries(
  AUDIENCES.map((a) => [a.id, a]),
) as Partial<Record<Audience, AudienceDef>>;

const ALL_AUDIENCE_BY_ID = Object.fromEntries(
  ALL_AUDIENCES.map((a) => [a.id, a]),
) as Record<Audience, AudienceDef>;

/** Full-catalog lookup (ungated) — for templates tagged with any audience. */
export function getAudience(id: Audience): AudienceDef {
  return ALL_AUDIENCE_BY_ID[id];
}
