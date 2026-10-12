/**
 * AI-resilient sector taxonomy — single source of truth for vertical
 * targeting across articles, jobs, resume templates, and affiliate
 * specialization.
 *
 * Same DRY pattern as `shared/media-kinds.ts`: every consumer reads the
 * enum + metadata from this one module. Never prop-drill a
 * `isPhysicalEconomy` boolean — components self-gate by calling
 * `sectorMeta(slug).aiResilience` directly.
 *
 * Framing decision (2026-05-24): we use "AI-resilient" rather than
 * "AI-proof" because some roles WITHIN each sector are actively being
 * automated (paralegals, medical coders, government clerical, electrical
 * estimators). The `aiResilience` + `aiResilienceNotes` fields force every
 * surface (landing pages, articles, pivot explorer) to be honest about
 * which roles inside the vertical are exposed vs. durable.
 *
 * `contentOnly` discriminates surfaces that have articles + education but
 * no marketplace underneath — e.g. `politics_civic` (run-for-office
 * guidance) where you can't post a job or get hired through hired.video.
 *
 * Adding a new sector means: (1) edit this one record (enum + metadata);
 * (2) the migration `0112_sector_taxonomy.sql` already accepts any value
 * via varchar (no CHECK constraint by design — sectors are a content
 * dimension, not a storage discriminator, and new ones land regularly).
 */

import { HIRING_PERSONAS_ENABLED } from "./user-roles.js";

export const SECTORS = [
  "tech",
  "healthcare",
  "legal",
  "government",
  "law_enforcement",
  "security",
  "skilled_trades",
  "beauty_personal_care",
  "gig_work",
  "politics_campaigns",
  "politics_civic",
] as const;

export type Sector = (typeof SECTORS)[number];

export type AIResilience = "high" | "medium" | "low";

export interface SectorMeta {
  /** Stable slug — what gets persisted in `articles.sector`, etc. */
  slug: Sector;
  /** Human label for the sector picker / filter chip. */
  label: string;
  /** Short one-line tagline used on landing pages + filter tooltips. */
  tagline: string;
  /**
   * Honest assessment of how exposed the sector is to AI automation.
   *   `high`   — durable (physical/in-person work; licensed authority).
   *   `medium` — mixed (significant resilient + exposed roles).
   *   `low`    — heavily exposed (mostly knowledge-work, easily automated).
   */
  aiResilience: AIResilience;
  /** Per-sector nuance: which roles are durable vs. exposed. */
  aiResilienceNotes: string;
  /** Sample roles for the sector landing page + pivot explorer. */
  exampleRoles: string[];
  /** Does the sector require formal licensure / credentialing? */
  requiresLicense: boolean;
  /** Short licensure notes for "what you need to enter" sections. */
  licensingNotes?: string;
  /**
   * Skills a tech worker (the "from" side of the most common pivot)
   * already brings into this sector. Drives pivot-explorer recommendations
   * and "transferable skills" article generation.
   */
  transferableFromTech: string[];
  /**
   * Marketplace-disabled sector — articles + education only, no job
   * board, no recruiter pipeline. Used by `politics_civic` ("run for
   * office") where there's no employer to hire you.
   */
  contentOnly: boolean;
  /** Icon key for the SectorPicker chip. Maps to lucide-react icon name. */
  iconKey: string;
}

const META: Record<Sector, SectorMeta> = {
  tech: {
    slug: "tech",
    label: "Technology",
    tagline: "Software, IT, and digital roles — included so pivot stories have a 'from' side.",
    aiResilience: "low",
    aiResilienceNotes:
      "Knowledge-work coding, QA, and junior analyst roles are the most directly automated category. Senior systems / security / hardware roles remain resilient, but the pivot funnel assumes 'tech' is the sector users are LEAVING.",
    exampleRoles: ["Software Engineer", "QA Engineer", "Data Analyst", "DevOps", "Product Manager"],
    requiresLicense: false,
    transferableFromTech: [],
    contentOnly: false,
    iconKey: "Cpu",
  },
  healthcare: {
    slug: "healthcare",
    label: "Healthcare & Medical",
    tagline: "Patient-facing care, licensed clinicians, and hands-on medical work.",
    aiResilience: "high",
    aiResilienceNotes:
      "Direct patient care (nursing, EMT/paramedic, surgical tech, physical therapy, dental hygiene, home health aide) remains durable — touch, judgement under uncertainty, and licensure barriers. Medical coding, transcription, radiology pre-reads, and basic claims processing are actively being automated.",
    exampleRoles: ["Registered Nurse", "EMT / Paramedic", "Surgical Tech", "Physical Therapist", "Phlebotomist", "Home Health Aide"],
    requiresLicense: true,
    licensingNotes:
      "Most clinical roles require state licensure (RN, LPN, EMT, PT, OT, dental hygiene). Allied-health certificates (CNA, MA, phlebotomy, surgical tech) are 6–18 month programs and the fastest entry point from tech.",
    transferableFromTech: [
      "Systems thinking → clinical workflow optimization",
      "Documentation discipline → EHR charting accuracy",
      "On-call / paging tolerance → 12-hour shift rotations",
      "Cross-functional escalation → multi-disciplinary care teams",
    ],
    contentOnly: false,
    iconKey: "Stethoscope",
  },
  legal: {
    slug: "legal",
    label: "Legal",
    tagline: "Licensed legal work, courtroom practice, and adjacent regulated roles.",
    aiResilience: "medium",
    aiResilienceNotes:
      "Licensed attorney roles (litigation, criminal defense, family law, M&A counsel) remain durable due to bar admission + courtroom presence + fiduciary liability. Paralegal research, document review, and contract first-pass drafting are heavily automated — entry-level pipelines have shrunk. Court reporters (stenographers) remain in-demand.",
    exampleRoles: ["Litigator", "Criminal Defense Attorney", "Court Reporter", "Mediator", "Compliance Officer", "Title Agent"],
    requiresLicense: true,
    licensingNotes:
      "Attorney roles require JD + state bar admission (~7 years post-undergrad). Court reporter certification is 2-3 years. Title/escrow agents need state licensure (weeks to months). Mediator certifications are state-specific.",
    transferableFromTech: [
      "Systems analysis → statutory interpretation",
      "Documentation rigor → legal writing",
      "Adversarial debugging → cross-examination prep",
      "Compliance/security background → regulatory roles (no bar required)",
    ],
    contentOnly: false,
    iconKey: "Scale",
  },
  government: {
    slug: "government",
    label: "Government & Public Service",
    tagline: "Federal, state, and municipal roles — civil service, public works, infrastructure.",
    aiResilience: "medium",
    aiResilienceNotes:
      "Inspectors (building, food safety, OSHA), public-works operators, and field staff are durable. Clerical / data-entry / records-processing roles inside agencies are being automated and headcounts are flat-to-declining. Security clearance roles remain resilient — clearance itself is a moat.",
    exampleRoles: ["Building Inspector", "OSHA Inspector", "Postal Carrier", "Public Works Operator", "Intelligence Analyst (cleared)", "Park Ranger"],
    requiresLicense: false,
    licensingNotes:
      "Most roles require passing a civil-service exam + background check. Cleared positions require Secret / Top Secret / TS-SCI clearance — clearance is sponsored by the hiring agency or by a cleared contractor.",
    transferableFromTech: [
      "Sysadmin / cyber experience → cleared IT and SOC roles (huge demand)",
      "Data engineering → analyst tracks at DoD / IC contractors",
      "Project management → agency program management (GS-13/14)",
      "Security background → physical security + clearance roles",
    ],
    contentOnly: false,
    iconKey: "Landmark",
  },
  law_enforcement: {
    slug: "law_enforcement",
    label: "Law Enforcement",
    tagline: "Police, sheriffs, federal agents, corrections, and adjacent sworn roles.",
    aiResilience: "high",
    aiResilienceNotes:
      "Patrol, investigations, corrections, and sworn-officer roles are physical/in-person and require statutory authority — durable. Civilian analyst, dispatch, and records roles inside departments are partially exposed to automation but still hiring.",
    exampleRoles: ["Police Officer", "Sheriff's Deputy", "Federal Agent (FBI/DEA/ATF)", "Corrections Officer", "Crime Scene Tech", "911 Dispatcher"],
    requiresLicense: true,
    licensingNotes:
      "Sworn roles require academy + state POST certification (6-9 months). Federal agent paths require degree + multi-stage hiring (12-18 months end-to-end). Background, polygraph, and psych screening are universal.",
    transferableFromTech: [
      "Incident response background → digital forensics / cybercrime units",
      "OSINT / threat-intel work → intelligence and gang/fraud units",
      "Programming → department GIS / records / analyst civilian tracks",
    ],
    contentOnly: false,
    iconKey: "Shield",
  },
  security: {
    slug: "security",
    label: "Security & Protective Services",
    tagline: "Private security, executive protection, and licensed armed/unarmed guards.",
    aiResilience: "high",
    aiResilienceNotes:
      "In-person guard, executive protection, event security, and armored-transport roles require physical presence and authority — durable. Camera-monitoring SOC roles are partially exposed to AI vision systems but headcounts are growing not shrinking (someone still has to dispatch).",
    exampleRoles: ["Armed Security Officer", "Executive Protection Agent", "Event Security", "Armored Transport", "Loss Prevention", "GSOC Analyst"],
    requiresLicense: true,
    licensingNotes:
      "State-level guard card (days to weeks) for unarmed; firearms endorsement (weeks of training + range) for armed. Executive protection requires additional defensive driving, medical, and often firearms certifications.",
    transferableFromTech: [
      "Cyber/SOC background → corporate GSOC and protective-intel teams",
      "OSINT → executive protection advance work",
      "Discipline of on-call → 12-hour security rotations",
    ],
    contentOnly: false,
    iconKey: "ShieldAlert",
  },
  skilled_trades: {
    slug: "skilled_trades",
    label: "Skilled Trades",
    tagline: "Welding, electrical, plumbing, HVAC, carpentry, and licensed trade work.",
    aiResilience: "high",
    aiResilienceNotes:
      "Physical, on-site, judgement-under-variability work is the most durable category in the labor market. Estimating, scheduling, and bid generation are getting AI-assisted but the on-tools work itself is not automatable. Master / journeyman tradespeople have leverage they did not have a decade ago.",
    exampleRoles: ["Electrician", "Plumber", "HVAC Technician", "Welder", "Carpenter", "Pipefitter", "Millwright", "Solar Installer"],
    requiresLicense: true,
    licensingNotes:
      "Apprenticeship (typically 4-5 years, paid throughout) leads to journeyman license, then master license. Union apprenticeships (IBEW, UA, Ironworkers, etc.) include classroom + on-the-job pay and full benefits. Non-union paths are faster but compensation tracks slower in the first decade.",
    transferableFromTech: [
      "Systems debugging → diagnosing electrical / HVAC faults",
      "Reading specifications → reading prints and code books",
      "Tool literacy → adoption of trade-specific instruments",
      "Process discipline → safety / lock-out-tag-out compliance",
    ],
    contentOnly: false,
    iconKey: "Wrench",
  },
  beauty_personal_care: {
    slug: "beauty_personal_care",
    label: "Beauty & Personal Care",
    tagline: "Cosmetology, barbering, esthetics, massage therapy, and personal-care services.",
    aiResilience: "high",
    aiResilienceNotes:
      "Every service in this sector requires physical touch and an in-person client — fundamentally not automatable. AI tools assist with booking, marketing, and consultation prep, but the chair-time itself remains the product. Booth-rental / chair-rental economics give practitioners small-business leverage similar to trades.",
    exampleRoles: ["Cosmetologist", "Barber", "Esthetician", "Nail Technician", "Massage Therapist", "Tattoo Artist", "Lash / Brow Tech"],
    requiresLicense: true,
    licensingNotes:
      "State cosmetology / barber / esthetics licensing — typically 600-1600 instructional hours plus a state exam. Massage therapy is separately licensed (500+ hours). Booth-rental is the dominant working model post-license; many practitioners become independent operators rather than W-2 employees.",
    transferableFromTech: [
      "Booking / scheduling product literacy → running a chair-rental practice",
      "Social-media / content skills → building an Instagram/TikTok client pipeline",
      "Customer-support background → consultations + retention",
    ],
    contentOnly: false,
    iconKey: "Scissors",
  },
  gig_work: {
    slug: "gig_work",
    label: "Gig & On-Demand",
    tagline: "Delivery, rideshare, courier, on-demand labor, and platform-mediated physical work.",
    aiResilience: "medium",
    aiResilienceNotes:
      "Physical-delivery gig work (DoorDash / Uber / Instacart / TaskRabbit) is durable as long as last-mile autonomy isn't solved at scale — likely the longest-running 'AI-resilient' category in the medium term but the most exposed long-term. Marketplace dispatching / fraud / rider-side support is heavily automated. Best fit for income bridging during pivots rather than a 20-year career.",
    exampleRoles: ["Rideshare Driver", "Delivery Driver", "Courier", "Handyman (TaskRabbit)", "Mover", "Field Inspector (Gig)"],
    requiresLicense: false,
    licensingNotes:
      "Most platforms require valid driver's license, vehicle inspection, and clean background. Some specialty gig roles (mobile notary, mobile inspections) require state-specific certifications.",
    transferableFromTech: [
      "Optimization mindset → multi-app stacking and earnings math",
      "Customer service → rating maintenance",
      "Geographic / mapping intuition → route efficiency",
    ],
    contentOnly: false,
    iconKey: "Car",
  },
  politics_campaigns: {
    slug: "politics_campaigns",
    label: "Politics & Campaigns",
    tagline: "Campaign staff, legislative offices, lobbying, advocacy, and government affairs.",
    aiResilience: "medium",
    aiResilienceNotes:
      "Field organizing, fundraising, candidate-facing communications, and legislative-affairs work depend on human relationships and political trust — durable. Opposition research, polling analytics, and digital ad operations are heavily automated; campaign-tech roles still hire but with shrinking teams.",
    exampleRoles: ["Field Organizer", "Communications Director", "Legislative Aide", "Chief of Staff", "Lobbyist", "Press Secretary", "Fundraiser"],
    requiresLicense: false,
    licensingNotes:
      "No licensure, but lobbying requires state/federal registration (LDA at the federal level). Most paths start as an unpaid or low-paid campaign cycle (field, comms, finance) followed by transition to congressional staff or party committee work.",
    transferableFromTech: [
      "Data / SQL skills → voter file analytics (VAN, PDI, etc.)",
      "Web / digital skills → digital director roles (in shrinking demand but real)",
      "Project management → state director / regional director paths",
    ],
    contentOnly: false,
    iconKey: "Vote",
  },
  politics_civic: {
    slug: "politics_civic",
    label: "Run for Office (Civic Education)",
    tagline: "Education-only sector: how to file, fundraise, and run for local + state office.",
    aiResilience: "high",
    aiResilienceNotes:
      "Not an employment sector — this surface exists for civic-education content. Elected office is held, not hired. Resilience framing is not applicable; we include the sector so the article system can carry 'how to run for school board / city council / state legislature' content adjacent to the recruitable politics surface.",
    exampleRoles: [
      "School Board Member (elected)",
      "City Council Member (elected)",
      "County Commissioner (elected)",
      "State Legislator (elected)",
    ],
    requiresLicense: false,
    licensingNotes:
      "Filing requirements vary by office and state — ballot petitions, filing fees, and residency rules are jurisdiction-specific. No formal credentialing.",
    transferableFromTech: [
      "Public-facing problem solving → policy fluency",
      "Project / budget literacy → city / school district budget cycles",
      "Community organizing (open-source maintainership counts) → coalition building",
    ],
    contentOnly: true,
    iconKey: "Megaphone",
  },
};

export function sectorMeta(slug: Sector): SectorMeta {
  return META[slug];
}

export function allSectors(): SectorMeta[] {
  return SECTORS.map((s) => META[s]);
}

/**
 * Sectors a job board / recruiter pipeline can target. Excludes
 * `contentOnly` sectors (politics_civic) since you can't post a job for
 * an elected position.
 */
export function recruitableSectors(): SectorMeta[] {
  return allSectors().filter((m) => !m.contentOnly);
}

/**
 * Sectors that anchor the AI-pivot funnel — every sector except `tech`
 * itself (which is the "from" side) and `politics_civic` (content-only).
 */
export function pivotTargetSectors(): SectorMeta[] {
  return allSectors().filter((m) => m.slug !== "tech" && !m.contentOnly);
}

export function isValidSector(value: unknown): value is Sector {
  return typeof value === "string" && (SECTORS as readonly string[]).includes(value);
}

/**
 * Article category vocabulary scoped per audience. The articles table
 * already has a free-text `category` column — these constants are the
 * authoring + filtering vocabulary every surface should reuse.
 */
export const ARTICLE_AUDIENCES = ["job_seeker", "recruiter", "pivot", "resume_guide", "civic"] as const;
export type ArticleAudience = (typeof ARTICLE_AUDIENCES)[number];

export const ARTICLE_AUDIENCE_LABELS: Record<ArticleAudience, string> = {
  job_seeker: "For Job Seekers",
  recruiter: "For Recruiters & Employers",
  pivot: "Pivoting In",
  resume_guide: "Resume Guide",
  civic: "Civic / Run for Office",
};

/** Article audiences tied to a hiring persona (recruiter / employer readers). */
const HIRING_ARTICLE_AUDIENCES: ReadonlySet<ArticleAudience> = new Set<ArticleAudience>(["recruiter"]);

/** Is this article audience currently offered? The hiring audience follows
 *  HIRING_PERSONAS_ENABLED (`hiringEnabled` injectable for tests); every
 *  other audience is always live. Unknown / null audiences pass. */
export function isArticleAudienceEnabled(
  audience: string | null | undefined,
  hiringEnabled: boolean = HIRING_PERSONAS_ENABLED,
): boolean {
  if (!audience) return true;
  return hiringEnabled || !HIRING_ARTICLE_AUDIENCES.has(audience as ArticleAudience);
}

/** Article audiences offered as public filters (pure, testable). Mirrors
 *  `enabledLifeStageAudiences` in audiences-registry.ts. */
export function enabledArticleAudiences(
  hiringEnabled: boolean = HIRING_PERSONAS_ENABLED,
): ArticleAudience[] {
  return ARTICLE_AUDIENCES.filter((a) => isArticleAudienceEnabled(a, hiringEnabled));
}

// ──────────────────────────────────────────────────────────────────────
// Sector classification — keyword-based heuristic for tagging scraped /
// untagged jobs (gap #1172). Pure, dependency-free, deterministic; runs
// inside the Worker without an LLM call. Returns null when no keyword
// matches confidently (caller leaves the row untagged rather than
// guessing wrong).
// ──────────────────────────────────────────────────────────────────────

const SECTOR_KEYWORDS: Record<Sector, RegExp[]> = {
  healthcare: [
    /\b(nurse|nursing|rn|lpn|cna|registered\s+nurse|paramedic|emt|cna|medical\s+assistant|phlebotom|surgical\s+tech|physical\s+therapist|occupational\s+therapist|home\s+health|dental\s+hygien|dentist|physician|nurse\s+practitioner|pharmacist|radiolog|sonograph|respiratory\s+therap|hospice|clinic|patient\s+care|caregiver|cna|nursing\s+assistant)\b/i,
  ],
  legal: [
    /\b(attorney|lawyer|paralegal|legal\s+assistant|litigat|counsel|court\s+reporter|stenograph|mediator|bar\s+admitted|esquire|jd|public\s+defender|prosecutor|title\s+agent|escrow\s+officer)\b/i,
  ],
  government: [
    /\b(federal|gs[-\s]?(\d+)|civil\s+service|usajobs|government|agency|department\s+of|state\s+of|county\s+of|city\s+of|public\s+works|inspector\s+(building|food|safety|osha)|postal|park\s+ranger|clearance|secret|top\s+secret|tssci|ts\/sci)\b/i,
  ],
  law_enforcement: [
    /\b(police|sheriff|deputy|officer|patrol|fbi|dea|atf|federal\s+agent|corrections\s+officer|cop|trooper|marshal|swat|detective|crime\s+scene|911\s+dispatch|dispatcher)\b/i,
  ],
  security: [
    /\b(security\s+officer|guard|armed\s+security|unarmed\s+security|executive\s+protection|loss\s+prevention|gsoc|armored\s+transport|event\s+security|bouncer|protective\s+services)\b/i,
  ],
  skilled_trades: [
    /\b(electrician|plumber|hvac|welder|carpenter|pipefitter|millwright|ironworker|sheetmetal|sheet\s+metal|mason|roofer|drywall|painter|tile\s+setter|insulation|solar\s+installer|wind\s+technician|journeyman|master\s+(electrician|plumber)|apprentice|ibew|ua\s+local|trade\s+school)\b/i,
  ],
  beauty_personal_care: [
    /\b(cosmetolog|barber|hair\s+stylist|hairstylist|esthetician|nail\s+tech|nail\s+technician|massage\s+therap|spa|salon|brow\s+tech|lash\s+tech|makeup\s+artist|tattoo\s+artist|booth\s+rental|chair\s+rental)\b/i,
  ],
  gig_work: [
    /\b(rideshare|uber|lyft|doordash|instacart|grubhub|delivery\s+driver|courier|gig|task[-\s]?rabbit|on[-\s]?demand|mover|moving\s+helper|field\s+inspector|mobile\s+notary)\b/i,
  ],
  politics_campaigns: [
    /\b(campaign|field\s+organizer|legislative\s+(aide|director|assistant)|chief\s+of\s+staff|press\s+secretary|communications\s+director|lobbyist|political\s+director|finance\s+director|deputy\s+campaign|state\s+director|regional\s+organizer|opposition\s+research)\b/i,
  ],
  tech: [
    /\b(software\s+engineer|developer|programmer|devops|sre|qa\s+engineer|frontend|backend|fullstack|full[-\s]stack|machine\s+learning|ml\s+engineer|data\s+scientist|data\s+analyst|product\s+manager|ux\s+designer|ui\s+designer|engineering\s+manager|technical\s+lead|tech\s+lead|architect|cto|cio|it\s+(support|admin|manager)|sysadmin|cybersecurity|infosec)\b/i,
  ],
  politics_civic: [
    // Civic / run-for-office is content-only — never auto-classify a job into it.
  ],
};

/**
 * Heuristic sector classification for a job posting. Pure function —
 * runs inside the Worker without an LLM call. Returns the first sector
 * whose keyword set matches, scored by match count across title +
 * description (title weighted 3x since it's the strongest signal).
 *
 * Returns `null` when no sector hits — caller leaves the row untagged
 * rather than guessing. Recruiters can manually tag through the picker.
 *
 * Used by:
 *   - api/src/services/job/scraper.ts insert path (#1172)
 *   - api/src/services/job/JobService.ts saveScrapedJob (#1172)
 */
export function classifyJobSector(
  title: string | null | undefined,
  description: string | null | undefined,
): Sector | null {
  const titleStr = (title ?? "").trim();
  const descStr = (description ?? "").trim();
  if (!titleStr && !descStr) return null;

  let best: { sector: Sector; score: number } | null = null;
  for (const sector of SECTORS) {
    const patterns = SECTOR_KEYWORDS[sector];
    if (!patterns || patterns.length === 0) continue;
    let score = 0;
    for (const re of patterns) {
      if (titleStr && re.test(titleStr)) score += 3;
      if (descStr && re.test(descStr)) score += 1;
    }
    if (score > 0 && (best === null || score > best.score)) {
      best = { sector, score };
    }
  }
  // Minimum confidence threshold: at least one title hit OR two description hits.
  if (best && best.score >= 2) return best.sector;
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// Affiliate specialty bonus — pure helper used by the conversion-path
// commission calc (gap #1166). When a referral's landing_sector matches
// one of the affiliate's specialty_sectors, apply a flat +5% multiplier
// on top of the tier's bonus percentage.
// ──────────────────────────────────────────────────────────────────────

/** Flat multiplier applied when an affiliate's specialty matches the
 *  referral's landing sector. Tuned to reward vertical creators without
 *  cannibalizing the tier ladder (max tier bonus is ~10%). */
export const SECTOR_SPECIALTY_BONUS = 0.05;

/**
 * Compute the effective commission rate given the affiliate's specialty
 * sectors and the referral's landing sector.
 *
 *   effective = baseRate + tierBonus + (specialty match ? SECTOR_SPECIALTY_BONUS : 0)
 *
 * Pure function — no DB calls. The caller passes in the persisted
 * `specialtySectors` array and the `landingSector` from the referral row.
 */
export function applySpecialtyBonus(opts: {
  baseRate: number;
  tierBonus: number;
  specialtySectors: string[];
  landingSector: string | null | undefined;
}): { effectiveRate: number; specialtyMatched: boolean } {
  const { baseRate, tierBonus, specialtySectors, landingSector } = opts;
  const matched =
    !!landingSector &&
    isValidSector(landingSector) &&
    specialtySectors.includes(landingSector);
  const effectiveRate = baseRate + tierBonus + (matched ? SECTOR_SPECIALTY_BONUS : 0);
  return { effectiveRate, specialtyMatched: matched };
}
