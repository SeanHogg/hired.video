// Marketing-content derivation for the marketplace template page (#901).
//
// The catalog already carries the structural facts about every template —
// its `audiences`, `importMode`, `mediaKind`, `category`, and `blurb`. This
// module projects those facts into the visitor-facing marketing surface the
// `/marketplace/templates/:slug` page renders: a context-aware CTA, a
// "how it works" walkthrough, "why use this", "why join", and the audience
// chips that tell a visitor whether the template is for them.
//
// Pure + derivation-first (no per-template copy deck): a new catalog entry
// gets sensible marketing content for free the moment it's registered, and
// the headline templates get their voice from the audience SSoT (the actor
// CTA — "Are you an actor? Showcase your acting experience." — lives on the
// `actor` AudienceDef, not hand-wired here). The ONLY hand-authored copy is
// the per-audience `cta` block in audiences.ts, which is shared with the
// /for/:audience landing pages — no parallel structure.
//
// Copy here is content data (English literals), consistent with the existing
// `desc` / `blurb` fields in catalog.tsx + audiences.ts which are likewise
// not run through i18n. The marketplace page localizes the section HEADINGS
// (chrome) via t(); the generated body copy is data, same as the catalog.

import {
  AUDIENCE_BY_ID,
  type Audience,
  type AudienceDef,
} from "@/components/studio/templates/audiences";
import type { ImportMode } from "@/components/studio/templates/catalog";
import type { MediaKind } from "@shared/media-kinds";
import type { TemplateMeta } from "./types";

export interface TemplateMarketing {
  /** One-line value prop shown under the title (the template's blurb). */
  tagline: string;
  /** Context-aware conversion banner — the hook + value prop, picked from
   *  the template's primary audience. */
  cta: { headline: string; subtext: string };
  /** Ordered "how it works" steps. */
  howItWorks: string[];
  /** "Why use this template" benefit bullets. */
  whyUse: string[];
  /** Visitor-facing reasons to join hired.video. */
  whyJoin: string[];
  /** Audiences this template serves, resolved to full defs for the chips. */
  audiences: AudienceDef[];
}

// Generic fallback CTA for templates whose primary audience has no entry
// (defensive — every Audience in the union has a cta today).
const FALLBACK_CTA = {
  headline: "Want to stand out?",
  subtext:
    "Build it free in the studio — your content, professional results, in minutes.",
};

/** What the finished artifact is called, for the "publish your finished ___"
 *  step. Falls back to "project" for any future kind. */
function nounFor(kind: MediaKind): string {
  switch (kind) {
    case "video":
      return "video";
    case "podcast":
      return "podcast";
    case "voice":
      return "voice clip";
    case "animation":
      return "animation";
    case "game":
      return "game";
    case "comic":
    case "interactive_comic":
      return "comic";
    case "image":
      return "image";
    case "cad":
      return "drawing";
    case "cad_3d":
      return "3D model";
    case "document":
      return "document";
    default:
      return "project";
  }
}

/** Resolve the audiences a template serves. Built-ins carry them on the
 *  catalog def; resume + creator kinds map to a sensible default so every
 *  template page can render audience chips + a context CTA. */
function audiencesFor(meta: TemplateMeta): Audience[] {
  if (meta.origin.kind === "studio-builtin") {
    return meta.origin.def.audiences;
  }
  if (meta.kind === "resume") return ["job_seeker"];
  // studio-creator: a creator-published video look — pitched to creators.
  return ["creator"];
}

/** First step of the "how it works" walkthrough — what the user supplies. */
function importModeStep(mode: ImportMode): string {
  switch (mode) {
    case "auto-resume":
      return "Open it and we'll pull straight from your master resume — no retyping.";
    case "auto-profile":
      return "Open it and we'll pull from your profile, bio, and any services you offer.";
    case "pick-job":
      return "Pick the role you're hiring for and we'll draft the script from the posting.";
    case "pick-company":
      return "Pick your company and we'll draft the script from its profile.";
    case "none":
    default:
      return "Describe what you want in a sentence — the AI drafts the first cut for you.";
  }
}

function howItWorksFor(meta: TemplateMeta): string[] {
  // Narrow on the origin discriminant (not `meta.kind`) so TypeScript can
  // safely reach `origin.def` in the studio-builtin tail below.
  if (meta.origin.kind === "resume") {
    return [
      "Open it on any of your resumes — your content, instantly restyled.",
      "Tweak colours, type, and layout to match the role you're chasing.",
      "Export a polished, recruiter-ready PDF in one click.",
    ];
  }

  const noun = nounFor(
    meta.origin.kind === "studio-builtin" ? meta.origin.def.mediaKind : "video",
  );
  const refine =
    "Refine the script, visuals, and pacing in the studio editor — no design skills needed.";
  const finish = `Publish, download, or share your finished ${noun} — or drop it straight onto your profile.`;

  if (meta.origin.kind === "studio-creator") {
    return [
      "Add it to your library — it's yours to reuse on any project.",
      refine,
      finish,
    ];
  }

  // studio-builtin
  return [importModeStep(meta.origin.def.importMode), refine, finish];
}

function whyUseFor(meta: TemplateMeta): string[] {
  const bullets = [
    "Studio-grade results without hiring a designer, editor, or film crew.",
    "AI writes the first draft, so you start from something — never a blank page.",
    "Reuse it across all your work — same content, instantly restyled.",
  ];
  if (meta.priceCents === 0) {
    bullets.push("Free to use — no subscription required to build and export.");
  }
  return bullets;
}

const WHY_JOIN = [
  "Free to start — build, preview, and export without a subscription.",
  "Every tool in one place: resumes, videos, portfolio, and your public profile.",
  "Get discovered — publish to your profile and share anywhere in one click.",
  "Design your own templates and keep 95% of every sale on the Marketplace.",
];

/** Project a template's catalog facts into its marketplace marketing surface. */
export function buildTemplateMarketing(meta: TemplateMeta): TemplateMarketing {
  const audienceIds = audiencesFor(meta);
  const audiences = audienceIds
    .map((id) => AUDIENCE_BY_ID[id])
    .filter(Boolean) as AudienceDef[];

  const primary = audiences[0];
  const cta = primary?.cta ?? FALLBACK_CTA;

  return {
    tagline: meta.blurb,
    cta,
    howItWorks: howItWorksFor(meta),
    whyUse: whyUseFor(meta),
    whyJoin: WHY_JOIN,
    audiences,
  };
}
