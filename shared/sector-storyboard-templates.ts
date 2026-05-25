/**
 * Sector-specific resume storyboard generator (gap #1167).
 *
 * Closes the gap by producing one VideoScript JSON per sector — but
 * without the maintenance burden of 10 hand-edited duplicates. Per the
 * DRY rule: every storyboard is rendered from this single module from
 * the SectorMeta SSoT + the recommended-template metadata. Adding a
 * sector means one entry in `shared/sectors.ts` (already required), not
 * a new JSON file by hand.
 *
 * Schema mirrors the existing `frontend/data/templates/video-resume-*.json`
 * shape — same `{ video, scenes[] }` root, same scene types
 * (`intro` / `achievement` / `skills` / `closing`). The studio loader
 * (`loadTemplate` in StudioSidebar.tsx) is unchanged.
 *
 * The build-time generator script `frontend/scripts/generate-sector-storyboards.mjs`
 * calls this module and writes one JSON file per recruitable sector to
 * `frontend/data/templates/`. The files are committed so the studio's
 * dynamic-import (Vite resolves these at build time) can resolve them.
 */

import {
  type Sector,
  pivotTargetSectors,
  sectorMeta,
  type SectorMeta,
} from "./sectors.js";
import { sectorTemplateRec } from "./sector-templates.js";

// ──────────────────────────────────────────────────────────────────────
// Type sketch — mirrors the studio's runtime VideoScript shape closely
// enough for the JSON loader. We intentionally don't import the
// frontend's VideoScript type here (shared/ stays import-free of
// frontend modules); the JSON shape is the contract.
// ──────────────────────────────────────────────────────────────────────

export interface SectorStoryboard {
  video: {
    duration: number;
    fps: number;
    resolution: "720p" | "1080p";
    aspect: "16:9" | "9:16" | "1:1";
    theme: {
      colorPalette: [string, string, string, string];
      fontFamily: string;
      motion: "minimal" | "moderate" | "energetic";
      transition: "fade" | "cut" | "slide";
      background: string;
    };
  };
  scenes: Array<
    | {
        id: string;
        start: number;
        duration: number;
        type: "intro";
        title: string;
        subtitle?: string;
        animation: SceneAnimation;
      }
    | {
        id: string;
        start: number;
        duration: number;
        type: "achievement";
        title: string;
        items: string[];
        animation: SceneAnimation;
      }
    | {
        id: string;
        start: number;
        duration: number;
        type: "skills";
        title: string;
        skills: string[];
        animation: SceneAnimation;
      }
    | {
        id: string;
        start: number;
        duration: number;
        type: "closing";
        title: string;
        subtitle?: string;
        animation: SceneAnimation;
      }
  >;
}

interface SceneAnimation {
  titleEnter?: { type: string; start: number; duration: number; easing: string };
  subtitleEnter?: { type: string; start: number; duration: number; easing: string };
  textEnter?: { type: string; start: number; duration: number; easing: string };
}

// ──────────────────────────────────────────────────────────────────────
// Per-sector visual palette + copy hooks. Palettes pick colours that
// signal the sector at a glance (medical = teal/white, trades = amber/
// steel, security = navy/slate, etc.). Copy lives close to the data so
// each sector's storyboard reads as "for this sector" rather than as
// generic boilerplate.
// ──────────────────────────────────────────────────────────────────────

interface SectorVisual {
  palette: [string, string, string, string];
  fontFamily: string;
  motion: "minimal" | "moderate" | "energetic";
  background: string;
}

const SECTOR_VISUALS: Record<Sector, SectorVisual> = {
  tech: {
    palette: ["#0f172a", "#38bdf8", "#1e293b", "#e2e8f0"],
    fontFamily: "Inter, sans-serif",
    motion: "moderate",
    background: "gradient",
  },
  healthcare: {
    palette: ["#0e7490", "#67e8f9", "#083344", "#ecfeff"],
    fontFamily: "Inter, sans-serif",
    motion: "minimal",
    background: "gradient",
  },
  legal: {
    palette: ["#1e1b4b", "#a5b4fc", "#312e81", "#f5f3ff"],
    fontFamily: "Merriweather, serif",
    motion: "minimal",
    background: "solid",
  },
  government: {
    palette: ["#1e3a8a", "#93c5fd", "#172554", "#eff6ff"],
    fontFamily: "Inter, sans-serif",
    motion: "minimal",
    background: "solid",
  },
  law_enforcement: {
    palette: ["#1e293b", "#facc15", "#0f172a", "#fef9c3"],
    fontFamily: "Inter, sans-serif",
    motion: "moderate",
    background: "solid",
  },
  security: {
    palette: ["#111827", "#ef4444", "#1f2937", "#fee2e2"],
    fontFamily: "Inter, sans-serif",
    motion: "moderate",
    background: "solid",
  },
  skilled_trades: {
    palette: ["#7c2d12", "#fbbf24", "#451a03", "#fef3c7"],
    fontFamily: "Inter, sans-serif",
    motion: "energetic",
    background: "gradient",
  },
  beauty_personal_care: {
    palette: ["#831843", "#f472b6", "#500724", "#fce7f3"],
    fontFamily: "Inter, sans-serif",
    motion: "moderate",
    background: "gradient",
  },
  gig_work: {
    palette: ["#365314", "#a3e635", "#1a2e05", "#f7fee7"],
    fontFamily: "Inter, sans-serif",
    motion: "energetic",
    background: "gradient",
  },
  politics_campaigns: {
    palette: ["#7f1d1d", "#fca5a5", "#450a0a", "#fee2e2"],
    fontFamily: "Inter, sans-serif",
    motion: "moderate",
    background: "gradient",
  },
  politics_civic: {
    palette: ["#365314", "#fbbf24", "#1a2e05", "#fef3c7"],
    fontFamily: "Inter, sans-serif",
    motion: "moderate",
    background: "gradient",
  },
};

// ──────────────────────────────────────────────────────────────────────
// Renderer — turns SectorMeta into the storyboard. Scene shapes mirror
// the existing `video-resume-pivot-led.json` exactly so the studio
// loader doesn't need a code path change.
// ──────────────────────────────────────────────────────────────────────

const ANIM_FADE_TITLE: SceneAnimation = {
  titleEnter: { type: "fadeIn", start: 0.2, duration: 0.4, easing: "easeOut" },
  textEnter: { type: "slideIn", start: 0.6, duration: 0.6, easing: "easeOut" },
};

const ANIM_INTRO: SceneAnimation = {
  titleEnter: { type: "slideUp", start: 0.1, duration: 0.5, easing: "easeOut" },
  subtitleEnter: { type: "fadeIn", start: 1.2, duration: 0.5, easing: "easeOut" },
};

const ANIM_SKILLS: SceneAnimation = {
  titleEnter: { type: "fadeIn", start: 0.2, duration: 0.4, easing: "easeOut" },
  textEnter: { type: "scaleIn", start: 0.5, duration: 0.6, easing: "spring" },
};

const ANIM_CLOSING: SceneAnimation = {
  titleEnter: { type: "slideUp", start: 0.2, duration: 0.5, easing: "easeOut" },
  subtitleEnter: { type: "fadeIn", start: 0.9, duration: 0.4, easing: "easeOut" },
};

/**
 * Per-sector copy hooks. Centralized so a wordsmithing pass touches one
 * place. Scene order: intro → credentials/background → recent work →
 * what-you-bring → ask.
 */
interface SectorCopy {
  introTitle: string;
  introSubtitle: string;
  scene2Title: string;
  scene2Items: string[];
  scene3Title: string;
  scene3Items: string[];
  scene4Title: string;
  scene4Skills: string[];
  closingTitle: string;
  closingSubtitle: string;
}

function copyFor(meta: SectorMeta): SectorCopy {
  switch (meta.slug) {
    case "healthcare":
      return {
        introTitle: "Licensed nurse. 5 years bedside. Looking for a step-down ICU role.",
        introSubtitle: "Your Name, RN — BSN, CCRN-K",
        scene2Title: "Licensure & Credentials",
        scene2Items: [
          "RN License: ST #XXXXXXX (expires MM/YYYY)",
          "BSN, Accredited School of Nursing, 2020",
          "CCRN-K (adult critical care), 2024",
          "BLS / ACLS / PALS current",
        ],
        scene3Title: "Bedside experience",
        scene3Items: [
          "12-bed med-surg telemetry — 3 years",
          "Charge nurse, evening shift, 2024",
          "Float pool across cardiac + surgical step-down",
        ],
        scene4Title: "What I bring",
        scene4Skills: [
          "High-acuity patient triage under pressure",
          "Mentored 6 new grads through their first year",
          "Comfortable on EPIC, Cerner, Meditech",
          "12-hour shift veteran — no surprises on the schedule",
        ],
        closingTitle: "Open to step-down ICU / CVICU roles in [region].",
        closingSubtitle: "linkedin.com/in/yourprofile · ready to interview.",
      };
    case "legal":
      return {
        introTitle: "Litigator. 7 years civil practice. State bar admitted, no disciplinary.",
        introSubtitle: "Your Name, Esq. — JD, Civil Litigation",
        scene2Title: "Admission & credentials",
        scene2Items: [
          "Bar admission: [State] (year), [State] (year)",
          "JD, Accredited Law School, [year]",
          "USDC [District] — active",
          "Federal: pro hac vice when needed",
        ],
        scene3Title: "Cases & specializations",
        scene3Items: [
          "Civil commercial litigation, $1M–$25M matters",
          "Lead counsel on 4 jury trials, 11 bench trials",
          "Mediation-certified, 2023",
        ],
        scene4Title: "What I bring",
        scene4Skills: [
          "First-chair trial experience",
          "Written advocacy that survives appellate review",
          "Calm under cross-examination",
          "Practice-management background (Clio / NetDocs)",
        ],
        closingTitle: "Open to mid-level associate / counsel roles in [city].",
        closingSubtitle: "[email] · let's talk.",
      };
    case "government":
      return {
        introTitle: "Cleared cyber analyst — TS/SCI. 8 years federal contractor.",
        introSubtitle: "Your Name, Cleared Cybersecurity Analyst",
        scene2Title: "Clearance & credentials",
        scene2Items: [
          "TS/SCI with current poly (renewed YYYY-MM)",
          "CISSP, Security+, OSCP",
          "DoD 8570 IAT Level III",
          "[Prime contractor] — current",
        ],
        scene3Title: "Mission work",
        scene3Items: [
          "Hunt operations on [agency] networks",
          "Authored SOPs adopted across 3 sub-agencies",
          "Built detection pipelines (Splunk, Elastic, MISP)",
        ],
        scene4Title: "What I bring",
        scene4Skills: [
          "On-mission cyber operations, not just compliance",
          "Cross-prime experience — quick to plug in",
          "Comfortable on closed networks + SCIFs",
          "Cleared and stays cleared",
        ],
        closingTitle: "Open to cleared cyber / SOC roles in [metro].",
        closingSubtitle: "Reach out via [cleared messaging] · ready to interview.",
      };
    case "law_enforcement":
      return {
        introTitle: "POST-certified officer. 6 years patrol. Open to specialty units.",
        introSubtitle: "Your Name — POST cert [State], #XXXXX",
        scene2Title: "Certification & training",
        scene2Items: [
          "POST certified ([State], YYYY)",
          "Crisis intervention (CIT), 2023",
          "Field training officer, 2024",
          "Firearms instructor certification",
        ],
        scene3Title: "Assignments",
        scene3Items: [
          "Patrol division — first responder",
          "Detective unit rotation (property crimes)",
          "K9 handler — accelerant detection (specialty)",
        ],
        scene4Title: "What I bring",
        scene4Skills: [
          "De-escalation training applied daily",
          "Clean record, current background OK to re-run",
          "Report writing that holds up in court",
          "Comfortable rotating shifts + on-call",
        ],
        closingTitle: "Open to specialty unit roles — detective, K9, SWAT, training.",
        closingSubtitle: "[email or department channel] · let's talk.",
      };
    case "security":
      return {
        introTitle: "Armed security. EP-trained. 5 years protective work.",
        introSubtitle: "Your Name — Armed Guard Card #XXXXX",
        scene2Title: "Licensure & training",
        scene2Items: [
          "State guard card (armed) — active",
          "Executive Protection training, [provider]",
          "TCCC + first aid current",
          "Defensive driving cert",
        ],
        scene3Title: "Recent engagements",
        scene3Items: [
          "EP detail for [HNW principal] — 18 months",
          "Corporate GSOC operator (overnight)",
          "Armored transport, 2021–2022",
        ],
        scene4Title: "What I bring",
        scene4Skills: [
          "Discretion + situational awareness on principal-facing detail",
          "OSINT advance work + route planning",
          "Clean firearms record, regular requal",
          "Stays calm — the principal feels it",
        ],
        closingTitle: "Open to EP / GSOC / corporate-security roles in [metro].",
        closingSubtitle: "[email] · ready to interview.",
      };
    case "skilled_trades":
      return {
        introTitle: "Journeyman electrician. IBEW Local XXX. 9 years on the tools.",
        introSubtitle: "Your Name — Journeyman, [State] License #XXXXX",
        scene2Title: "License & affiliation",
        scene2Items: [
          "[State] Journeyman license (active, YYYY)",
          "IBEW Local XXX — current good standing",
          "OSHA 30, NFPA 70E",
          "5+ years commercial + light industrial",
        ],
        scene3Title: "Recent jobs",
        scene3Items: [
          "Hospital expansion: switchgear, gen tie-in, fire-life-safety",
          "Solar PV: 800kW commercial rooftop array",
          "EV charging: Level 2 + DC fast charger installs",
        ],
        scene4Title: "What I bring",
        scene4Skills: [
          "Reads prints + writes RFIs that don't bounce",
          "Apprentice-trainer — keeps the green guys productive",
          "Pulls clean conduit + leaves the site cleaner than I found it",
          "Tool-truck self-sufficient — show up, get to work",
        ],
        closingTitle: "Open to journeyman / foreman roles — commercial preferred.",
        closingSubtitle: "Available [date]. [phone] · let's talk.",
      };
    case "beauty_personal_care":
      return {
        introTitle: "Master stylist. 6 years behind the chair. Building my book.",
        introSubtitle: "Your Name — Licensed Cosmetologist, [State]",
        scene2Title: "License & training",
        scene2Items: [
          "[State] Cosmetology license #XXXXX (active)",
          "Advanced color training — [brand academy]",
          "Extensions certified (NBR / Bellami)",
          "Bridal updos — destination weddings, 2024",
        ],
        scene3Title: "Recent work",
        scene3Items: [
          "Booth rental at [salon] — full book, 3-month waitlist",
          "Editorial: [publication / shoot, 2023]",
          "Specializing in lived-in color + curtain bangs",
        ],
        scene4Title: "What I bring",
        scene4Skills: [
          "Portable book — clients follow me",
          "Social media — IG @yourhandle (followers, engagement)",
          "Mentor for newer stylists",
          "Booth rental savvy — I run myself like a business",
        ],
        closingTitle: "Open to chair rental in [city] — modern salon, color-focused.",
        closingSubtitle: "@yourhandle · DM to book a chair tour.",
      };
    case "gig_work":
      return {
        introTitle: "Multi-app gig driver. 4 years, 12,000 rides, 4.97★.",
        introSubtitle: "Your Name — Rideshare, Delivery, On-Demand",
        scene2Title: "Platforms & status",
        scene2Items: [
          "Uber: Diamond tier, 4.97★",
          "Lyft: Platinum, 5,200+ rides",
          "DoorDash: Top Dasher, 99% on-time",
          "Vehicle: [year/make], inspected current",
        ],
        scene3Title: "Recent stretch",
        scene3Items: [
          "120+ hours/month, stable income tier",
          "Multi-app stacked for peak earnings",
          "Specialty: airport runs + late-night",
        ],
        scene4Title: "What I bring",
        scene4Skills: [
          "Reliable — never deactivated, never suspended",
          "Customer service rating in top 1%",
          "Clean driving record (current MVR available)",
          "Available [shifts you want]",
        ],
        closingTitle: "Open to W-2 driving roles — courier, last-mile, fleet.",
        closingSubtitle: "[phone] · ready to start [date].",
      };
    case "politics_campaigns":
      return {
        introTitle: "Field organizer. 3 cycles. Built turf from scratch in 2 states.",
        introSubtitle: "Your Name — Field, Comms, Digital",
        scene2Title: "Cycles worked",
        scene2Items: [
          "[Race], [year] — Field organizer, [region]",
          "[Race], [year] — Regional field director",
          "[Race], [year] — Comms director, paid media buy",
          "Win/loss: 2W–1L",
        ],
        scene3Title: "What I built",
        scene3Items: [
          "Volunteer pipeline: 0 → 350 weekly canvassers",
          "VAN data ops + nightly modeling refresh",
          "Door + phone + relational scaffolding",
        ],
        scene4Title: "What I bring",
        scene4Skills: [
          "Long hours, no surprise — campaign tempo is the job",
          "Speaks PDI + VAN + targeted email tools",
          "Comfortable on TV / podcast hits when needed",
          "Builds the operation, then makes it run without me",
        ],
        closingTitle: "Open to state director / regional roles for the [next] cycle.",
        closingSubtitle: "[encrypted contact] · let's talk.",
      };
    case "politics_civic":
      return {
        introTitle: "Running for school board, District 4.",
        introSubtitle: "Your Name — Parent, [profession], 12-year resident",
        scene2Title: "Why I'm running",
        scene2Items: [
          "Two kids in the district, K-8",
          "Three years on the PTA budget committee",
          "Frustrated with [specific issue you'll campaign on]",
          "Read every board meeting agenda, 2022–present",
        ],
        scene3Title: "What I'd do in office",
        scene3Items: [
          "[Concrete policy 1 — be specific, not slogan]",
          "[Concrete policy 2]",
          "Open office hours — first Saturday of each month",
        ],
        scene4Title: "What I bring",
        scene4Skills: [
          "Budget literacy — read your last 3 fiscal years",
          "Listens before talking",
          "Lives in the district, kids in the district",
          "No partisan funding — locally funded campaign",
        ],
        closingTitle: "Election: [date]. Vote: [polling location].",
        closingSubtitle: "yourname.com · join the campaign.",
      };
    case "tech":
      return {
        introTitle: "Senior engineer. 8 years. Open to staff-level roles.",
        introSubtitle: "Your Name — Distributed systems / backend",
        scene2Title: "Recent work",
        scene2Items: [
          "[Company]: scaled X to Y by Z%",
          "[Company]: built [system] handling N req/s",
          "Open source: maintainer of [project]",
          "Patents / publications if applicable",
        ],
        scene3Title: "Stack",
        scene3Items: [
          "Go / Rust / TypeScript",
          "Postgres + Redis + Kafka",
          "K8s + Terraform — but allergic to over-engineering",
        ],
        scene4Title: "What I bring",
        scene4Skills: [
          "Ships software that ops likes",
          "Mentors juniors without being a bottleneck",
          "Writes design docs people actually read",
          "Calm in production incidents",
        ],
        closingTitle: "Open to staff / principal IC roles, remote-first.",
        closingSubtitle: "github.com/yourhandle · let's talk.",
      };
  }
}

export function renderSectorStoryboard(sector: Sector): SectorStoryboard {
  const meta = sectorMeta(sector);
  const visual = SECTOR_VISUALS[sector];
  const copy = copyFor(meta);
  const rec = sectorTemplateRec(sector);

  const recRationale = rec.rationale; // surfaced via the storyboard description in the gallery

  return {
    video: {
      duration: 60,
      fps: 30,
      resolution: "720p",
      aspect: "16:9",
      theme: {
        colorPalette: visual.palette,
        fontFamily: visual.fontFamily,
        motion: visual.motion,
        transition: "fade",
        background: visual.background,
      },
    },
    scenes: [
      {
        id: "open",
        start: 0,
        duration: 5,
        type: "intro",
        title: copy.introTitle,
        subtitle: copy.introSubtitle,
        animation: ANIM_INTRO,
      },
      {
        id: "credentials",
        start: 5,
        duration: 13,
        type: "achievement",
        title: copy.scene2Title,
        items: copy.scene2Items,
        animation: ANIM_FADE_TITLE,
      },
      {
        id: "recent",
        start: 18,
        duration: 13,
        type: "achievement",
        title: copy.scene3Title,
        items: copy.scene3Items,
        animation: ANIM_FADE_TITLE,
      },
      {
        id: "bring",
        start: 31,
        duration: 13,
        type: "skills",
        title: copy.scene4Title,
        skills: copy.scene4Skills,
        animation: ANIM_SKILLS,
      },
      {
        id: "ask",
        start: 44,
        duration: 16,
        type: "closing",
        title: copy.closingTitle,
        subtitle: copy.closingSubtitle,
        animation: ANIM_CLOSING,
      },
    ],
    // Editorial-meta tail — not read by the storyboard player, but
    // present so gallery + documentation paths can introspect the
    // template without re-deriving from sector slug. Kept here rather
    // than parallel files (DRY).
    ...({ _meta: { sector, recommendation: recRationale } } as Record<string, unknown>),
  };
}

/**
 * Filename slug used both by the generator and by the existing
 * `sector-templates.ts` recommendation map. Single source of truth so
 * the gallery's "Open in studio?template=…" links resolve to the right
 * file.
 */
export function sectorStoryboardFile(sector: Sector): string {
  switch (sector) {
    case "healthcare": return "video-resume-medical-credentialed";
    case "legal": return "video-resume-legal-bar";
    case "government": return "video-resume-government-clearance";
    case "law_enforcement": return "video-resume-law-enforcement";
    case "security": return "video-resume-security-cleared";
    case "skilled_trades": return "video-resume-trade-licensed";
    case "beauty_personal_care": return "video-resume-beauty-portfolio";
    case "gig_work": return "video-resume-gig-rapid-deploy";
    case "politics_campaigns": return "video-resume-campaign-staff";
    case "politics_civic": return "video-resume-candidate-intro";
    case "tech": return "video-resume-professional";
  }
}

/**
 * Every sector storyboard that should land as a JSON file on disk.
 * Used by the generator script `frontend/scripts/generate-sector-storyboards.mjs`.
 * Excludes `tech` (uses the existing `video-resume-professional.json`).
 */
export function allGeneratedStoryboards(): Array<{
  sector: Sector;
  filename: string;
  storyboard: SectorStoryboard;
}> {
  const out: Array<{ sector: Sector; filename: string; storyboard: SectorStoryboard }> = [];
  // pivotTargetSectors() = every sector except tech + content-only. We
  // include politics_civic explicitly (candidate-intro is a real
  // surface even though it's not a hiring resume), and skip tech.
  const sectors: Sector[] = [
    ...pivotTargetSectors().map((m) => m.slug),
    "politics_civic",
  ];
  for (const sector of sectors) {
    out.push({
      sector,
      filename: sectorStoryboardFile(sector),
      storyboard: renderSectorStoryboard(sector),
    });
  }
  return out;
}
