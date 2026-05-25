/**
 * Sector → recommended resume template mapping.
 *
 * Single source of truth for "which existing template should a candidate
 * targeting this sector use?". Per the DRY rule + the v1-deprecation
 * memory (`project_v1_deprecation`): we don't ship 10 new storyboard
 * JSON files — we reuse the existing 5 (`pivot-led`, `professional`,
 * `hook-led`, `story-led`, `minimal`) with sector-specific framing.
 *
 * Why pivot-led is the default for tech-out pivots: it leads with the
 * WHY (career switch narrative) rather than chronology. The credentialing
 * sectors (healthcare, legal, law enforcement, government, security)
 * shift to professional/hook-led because the chronology + license listing
 * IS the resume — narrative arc undersells the credential.
 *
 * Sector-specific storyboard art (`video-resume-medical-credentialed`,
 * `video-resume-trade-licensed`, etc.) is deferred to a follow-up gap —
 * see Consolidated Gap Register. This registry + the gallery UI ship
 * today so candidates can discover the right template even before the
 * per-sector storyboards land.
 */

import { type Sector } from "./sectors.js";

export interface SectorTemplateRec {
  /** Template id from `frontend/lib/studio/visual-themes.ts` VISUAL_THEMES. */
  primaryThemeId: "pivot-led" | "professional" | "hook-led" | "story-led" | "minimal";
  /** Display name override — used in gallery cards instead of the generic theme label. */
  displayName: string;
  /** Why this template fits this sector. Surfaces in the gallery + resume-guide articles. */
  rationale: string;
  /** Secondary recommendations in priority order. */
  alternates: Array<{
    themeId: "pivot-led" | "professional" | "hook-led" | "story-led" | "minimal";
    when: string;
  }>;
}

const RECS: Record<Sector, SectorTemplateRec> = {
  tech: {
    primaryThemeId: "professional",
    displayName: "Professional (Tech)",
    rationale:
      "Default for software/IT roles. Cleanest fit when the recruiter is looking for chronology + stack list.",
    alternates: [
      { themeId: "hook-led", when: "You have one marquee project to lead with" },
      { themeId: "pivot-led", when: "You're a tech-to-tech pivot (e.g. backend → security)" },
    ],
  },
  healthcare: {
    primaryThemeId: "professional",
    displayName: "Credentialed Professional (Medical)",
    rationale:
      "Surfaces licensure + specialty hours above the chronology. Hiring managers screen for license verification in the first 10 seconds.",
    alternates: [
      { themeId: "pivot-led", when: "You're pivoting from tech / other field into healthcare" },
      { themeId: "minimal", when: "Per-diem or travel nurse — credentials drive selection, not narrative" },
    ],
  },
  legal: {
    primaryThemeId: "professional",
    displayName: "Bar-Admitted Professional",
    rationale:
      "Bar admission + jurisdiction + practice areas lead. Litigation experience and reported cases follow.",
    alternates: [
      { themeId: "story-led", when: "Solo practitioner or specialist with a defining case" },
      { themeId: "pivot-led", when: "Tech-to-legal-tech / compliance pivot (no JD required)" },
    ],
  },
  government: {
    primaryThemeId: "professional",
    displayName: "Cleared / Civil Service",
    rationale:
      "Clearance level (Secret / TS / TS-SCI) and grade (GS-13/14/15) lead. Agency tenure is the second screen.",
    alternates: [
      { themeId: "pivot-led", when: "Cyber/IT private-sector → cleared federal contractor pivot" },
      { themeId: "minimal", when: "Cleared role, sensitive employer history kept off public resume" },
    ],
  },
  law_enforcement: {
    primaryThemeId: "professional",
    displayName: "Sworn / Law Enforcement",
    rationale:
      "POST cert / academy graduation + agency + assignment history. Specialty units (K9, SWAT, digital forensics) get callouts.",
    alternates: [
      { themeId: "minimal", when: "Federal candidate keeping case detail confidential" },
      { themeId: "pivot-led", when: "Tech / military / corrections → sworn LE pivot" },
    ],
  },
  security: {
    primaryThemeId: "hook-led",
    displayName: "Security / Protective Services",
    rationale:
      "Guard card + firearms endorsement + specialty (EP, GSOC, armed transport) lead. Reliability signals (driving record, background) follow.",
    alternates: [
      { themeId: "professional", when: "Corporate GSOC / cyber-physical convergence roles" },
      { themeId: "pivot-led", when: "Cyber → physical security pivot" },
    ],
  },
  skilled_trades: {
    primaryThemeId: "hook-led",
    displayName: "Trade-Licensed",
    rationale:
      "Journeyman/master license + union affiliation + recent on-tools hours. Pictures of completed work outperform talking heads.",
    alternates: [
      { themeId: "story-led", when: "Specialty fabricator or restoration trades with portfolio focus" },
      { themeId: "pivot-led", when: "Tech-to-trade pivot — emphasize WHY + apprenticeship enrollment" },
    ],
  },
  beauty_personal_care: {
    primaryThemeId: "story-led",
    displayName: "Portfolio (Beauty)",
    rationale:
      "Booth-rental practitioners + chair-rental + freelance work — your work IS the resume. Story-led emphasizes the visual portfolio over chronology.",
    alternates: [
      { themeId: "hook-led", when: "Salon-employed and applying to chains" },
      { themeId: "professional", when: "Cosmetology educator / brand educator track" },
    ],
  },
  gig_work: {
    primaryThemeId: "minimal",
    displayName: "Rapid Deploy",
    rationale:
      "Platform onboarding is the screen — what you need is reliability + availability + vehicle/equipment status. Keep it short.",
    alternates: [
      { themeId: "professional", when: "Higher-tier gig work (mobile notary, mobile inspections)" },
      { themeId: "hook-led", when: "Building a gig-platform portfolio for transition to W-2" },
    ],
  },
  politics_campaigns: {
    primaryThemeId: "hook-led",
    displayName: "Campaign Staff",
    rationale:
      "Cycles worked + role + win/loss record. Names of principals or committees are the credential.",
    alternates: [
      { themeId: "story-led", when: "One marquee race that defines you" },
      { themeId: "pivot-led", when: "Tech/data background → digital director / VAN pivot" },
    ],
  },
  politics_civic: {
    primaryThemeId: "hook-led",
    displayName: "Candidate Intro",
    rationale:
      "Not a hiring resume — a candidate intro for voters. Lead with the WHY, the issue you're running on, and the community ties.",
    alternates: [
      { themeId: "story-led", when: "Single-issue campaign defining your candidacy" },
    ],
  },
};

export function sectorTemplateRec(sector: Sector): SectorTemplateRec {
  return RECS[sector];
}
