// Audience taxonomy for studio templates — single source of truth.
//
// Per the standing DRY rule, both the per-audience landing page (#900,
// `/for/:audience`) and the per-template landing page's "best for" chips
// (#901, `/templates/:slug`) read from this one registry plus the
// `audiences: Audience[]` field on `TemplateDef` (see catalog.tsx).
// Do NOT introduce a parallel `AUDIENCE_TO_TEMPLATES` map — filter the
// catalog directly: `TEMPLATE_CATALOG.filter(t => t.audiences.includes(id))`.
//
// Podcaster + educator landed alongside the Phase 2 podcast templates.
// voice_actor landed alongside the Phase 4 voice templates. animator
// lands here with the Phase 5 animation templates (#1003 / #1013).

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

export interface AudienceDef {
  id: Audience;
  /** Plural display label for chips / pills / filter buttons. */
  label: string;
  /** Short descriptor for tooltips, hovercards, and search filter rows.
   *  Hero copy for /for/:audience landing pages is added by #900 — a
   *  separate `heroCopy` field will join this registry then, not a
   *  parallel structure. */
  blurb: string;
  /** Context-aware conversion copy for the marketplace template page's CTA
   *  banner (#901). `headline` is the hook ("Are you an actor?"), `subtext`
   *  the value prop ("Showcase your acting experience…"). Single SoT so the
   *  template page, the /for/:audience landing page, and any future
   *  audience-targeted surface read the same voice — no parallel copy deck.
   *  `buildTemplateMarketing` (lib/templates/marketing.ts) picks the CTA for
   *  a template from its primary audience. */
  cta: { headline: string; subtext: string };
}

export const AUDIENCES: AudienceDef[] = [
  {
    id: "athlete",
    label: "Athletes",
    blurb: "Sports talent — recruit reels, season highlights, training breakdowns.",
    cta: {
      headline: "Are you an athlete?",
      subtext: "Turn your best moments into recruit reels and season highlights that scouts actually watch.",
    },
  },
  {
    id: "actor",
    label: "Actors",
    blurb: "Self-tapes, monologues, and showreels for casting submissions.",
    cta: {
      headline: "Are you an actor?",
      subtext: "Showcase your acting experience — self-tapes, monologues, and showreels casting directors actually watch.",
    },
  },
  {
    id: "director",
    label: "Directors",
    blurb: "Treatment pitches, casting calls, and DP / cinematographer reels.",
    cta: {
      headline: "Are you a director?",
      subtext: "Pitch your vision — treatments, casting calls, and cinematographer reels that get projects greenlit.",
    },
  },
  {
    id: "musician",
    label: "Musicians",
    blurb: "Performance reels and beat-cut highlights from your best sets.",
    cta: {
      headline: "Are you a musician?",
      subtext: "Cut your best sets into performance reels and beat-matched highlights that book gigs.",
    },
  },
  {
    id: "creator",
    label: "Creators",
    blurb: "Independent content creators promoting capabilities, projects, or an audience.",
    cta: {
      headline: "Are you a creator?",
      subtext: "Promote your work, grow your audience, and sell your own templates — keeping 95% of every sale.",
    },
  },
  {
    id: "job_seeker",
    label: "Job seekers",
    blurb: "Video resumes, skills demos, and personal-brand pitches that hiring managers actually watch.",
    cta: {
      headline: "On the job hunt?",
      subtext: "Stand out with a video resume hiring managers actually watch — built in minutes, no film crew.",
    },
  },
  {
    id: "recruiter",
    label: "Recruiters",
    blurb: "Job ads, talent-pool promos, and outreach video for candidate engagement.",
    cta: {
      headline: "Hiring talent?",
      subtext: "Turn open roles into video job ads and talent-pool promos that candidates actually click.",
    },
  },
  {
    id: "employer",
    label: "Employers",
    blurb: "Company promos, hiring spots, and employer-brand content for recruiting at scale.",
    cta: {
      headline: "Building your team?",
      subtext: "Show candidates who you are — company promos and hiring spots that recruit at scale.",
    },
  },
  {
    id: "founder",
    label: "Founders",
    blurb: "Startup pitches, product launches, and tool demos — the founder telling the story.",
    cta: {
      headline: "Building something?",
      subtext: "Pitch your product, your raise, or your launch — the founder telling the story, on camera.",
    },
  },
  {
    id: "developer",
    label: "Developers",
    blurb: "Code walkthroughs, architecture explainers, and open-source project demos.",
    cta: {
      headline: "Write code?",
      subtext: "Walk through your architecture and ship code demos that prove what you can build.",
    },
  },
  {
    id: "designer",
    label: "Designers",
    blurb: "Portfolio walkthroughs, case studies, and process reels for product / brand / motion work.",
    cta: {
      headline: "Design for a living?",
      subtext: "Turn your portfolio into a process reel that shows the thinking, not just the pixels.",
    },
  },
  {
    id: "data_analyst",
    label: "Data analysts",
    blurb: "Insight presentations, chart walkthroughs, and methodology demos with the data front-and-centre.",
    cta: {
      headline: "Work with data?",
      subtext: "Put the insight front-and-centre — chart walkthroughs and methodology demos that land the takeaway.",
    },
  },
  {
    id: "podcaster",
    label: "Podcasters",
    blurb: "Episode trailers, full-show recordings, and chapter-marked exports for every podcast platform.",
    cta: {
      headline: "Host a podcast?",
      subtext: "Trail your show, record full episodes, and export chapter-marked audio for every platform.",
    },
  },
  {
    id: "educator",
    label: "Educators",
    blurb: "Course trailers, lesson openers, and explainer episodes that meet learners on audio or video.",
    cta: {
      headline: "Teach or train?",
      subtext: "Build course trailers and lesson openers that meet your learners on audio or video.",
    },
  },
  {
    id: "voice_actor",
    label: "Voice actors",
    blurb: "Audition reels, character demos, narration samples, and ID spots — script-driven, voice-clone-friendly.",
    cta: {
      headline: "Are you a voice actor?",
      subtext: "Cut audition reels, character demos, and narration samples — script-driven and clone-ready.",
    },
  },
  {
    id: "game_dev",
    label: "Game developers",
    blurb: "Browser-playable game prototypes — endless runners, quizzes, memory games — that publish to itch.io or your own page.",
    cta: {
      headline: "Make games?",
      subtext: "Prototype browser-playable games and publish them to itch.io or your own page in an afternoon.",
    },
  },
  {
    id: "illustrator",
    label: "Illustrators",
    blurb: "Comics, drawing canvases, social posts, and OG cards — raster + vector tools with AI generation alongside.",
    cta: {
      headline: "Draw or illustrate?",
      subtext: "Create comics, social art, and link-preview cards with raster + vector tools and AI alongside.",
    },
  },
  {
    id: "animator",
    label: "Animators",
    blurb: "Frame-by-frame raster animation with onion-skin overlay — logo loops, reaction GIFs, explainer micro-loops exported as GIF / APNG / WebP.",
    cta: {
      headline: "Animate?",
      subtext: "Frame-by-frame loops, reaction GIFs, and explainer micro-loops exported as GIF, APNG, or WebP.",
    },
  },
  {
    id: "cad_user",
    label: "CAD users",
    blurb: "Architects, mechanical engineers, electrical hobbyists drafting 2D plans + part drawings + schematics in the studio — exports as SVG, DXF, and PDF.",
    cta: {
      headline: "Draft or design parts?",
      subtext: "Lay out floor plans, part drawings, and schematics — export as SVG, DXF, or PDF.",
    },
  },
];

export const AUDIENCE_BY_ID: Record<Audience, AudienceDef> = Object.fromEntries(
  AUDIENCES.map((a) => [a.id, a]),
) as Record<Audience, AudienceDef>;

export function getAudience(id: Audience): AudienceDef {
  return AUDIENCE_BY_ID[id];
}
