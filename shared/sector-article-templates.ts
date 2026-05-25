/**
 * Sector article templates — the renderer that turns a `SectorMeta` row
 * from `shared/sectors.ts` into a full markdown article for each of the
 * four audiences (job_seeker / recruiter / pivot / resume_guide), plus
 * the civic variant for `politics_civic`.
 *
 * Single source of truth so editorial polish lands in one place. Per
 * the DRY rule: the seed script (`api/src/scripts/seed-sector-articles.ts`)
 * AND any future "regenerate this sector's content" admin action call
 * the same renderers — never hand-edit ONE article when the same change
 * applies to all 10 sectors.
 *
 * Output is honest about AI exposure (per the 2026-05-24 decision to use
 * "AI-resilient" framing, not "AI-proof"). Each article quotes
 * `aiResilienceNotes` verbatim so the editorial voice can't drift.
 */

import {
  type ArticleAudience,
  type SectorMeta,
  pivotTargetSectors,
  sectorMeta,
  type Sector,
} from "./sectors.js";

export interface SectorArticleDraft {
  sector: Sector;
  audience: ArticleAudience;
  /** Article title. Title-cased per editorial style. */
  title: string;
  /** Editor-facing summary (max 280 chars). */
  summary: string;
  /** Suggested tags — sector slug + audience + 1-2 free-text aids. */
  tags: string[];
  /** Markdown body. */
  bodyMd: string;
}

// ──────────────────────────────────────────────────────────────────────
// Per-audience renderers
// ──────────────────────────────────────────────────────────────────────

function jobSeekerArticle(meta: SectorMeta): SectorArticleDraft {
  const sample = meta.exampleRoles.slice(0, 6);
  const lines: string[] = [];
  lines.push(`# Getting Hired in ${meta.label}`);
  lines.push("");
  lines.push(meta.tagline);
  lines.push("");
  lines.push(`## Is this sector right for you?`);
  lines.push("");
  lines.push(
    `${meta.label} is in our **AI-resilient** category${aiResilienceQualifier(meta)}. We picked this framing deliberately — calling any sector "AI-proof" overstates the case. Here's the honest read:`,
  );
  lines.push("");
  lines.push(`> ${meta.aiResilienceNotes}`);
  lines.push("");
  lines.push(`## Roles worth targeting`);
  lines.push("");
  sample.forEach((r) => lines.push(`- ${r}`));
  lines.push("");
  if (meta.requiresLicense && meta.licensingNotes) {
    lines.push(`## What you need to get hired`);
    lines.push("");
    lines.push(meta.licensingNotes);
    lines.push("");
  } else {
    lines.push(`## What you need to get hired`);
    lines.push("");
    lines.push(
      `${meta.label} roles do not require formal licensure. The entry bar is set by employer-specific screening (background checks, drug tests, skills assessments) and any platform-specific onboarding requirements.`,
    );
    lines.push("");
  }
  lines.push(`## How to apply through hired.video`);
  lines.push("");
  lines.push(
    `Filter the [Jobs board](/jobs?sector=${meta.slug}) by **${meta.label}** to see only positions tagged to this sector. Save jobs you're interested in to your pipeline — the tracker keeps your applications organized across multiple sectors if you're exploring a pivot.`,
  );
  lines.push("");
  lines.push(`## Resume guidance`);
  lines.push("");
  lines.push(
    `Use the **${recommendedTemplateName(meta)}** template — it's tuned for the credentialing, licensure, and on-the-tools experience that ${meta.label} hiring managers actually screen for. See [Which resume template should I use for ${meta.label}?](/articles?sector=${meta.slug}&audience=resume_guide) for a longer breakdown.`,
  );
  lines.push("");
  return {
    sector: meta.slug,
    audience: "job_seeker",
    title: `Getting Hired in ${meta.label}: A Job Seeker's Guide`,
    summary: `Honest, role-by-role guide to entering ${meta.label}, including credential requirements and which resume template to use.`,
    tags: [meta.slug, "job-seekers", "career-entry"],
    bodyMd: lines.join("\n"),
  };
}

function recruiterArticle(meta: SectorMeta): SectorArticleDraft {
  const sample = meta.exampleRoles.slice(0, 5);
  const lines: string[] = [];
  lines.push(`# Recruiting for ${meta.label}`);
  lines.push("");
  lines.push(`A practical guide for recruiters and hiring managers placing candidates in ${meta.label}.`);
  lines.push("");
  lines.push(`## What's distinctive about this sector`);
  lines.push("");
  lines.push(
    `${meta.label} hiring has different velocity, credentialing, and channel mix than knowledge-work hiring. Before you copy a tech-recruiting playbook into this vertical, recognize:`,
  );
  lines.push("");
  lines.push(`> ${meta.aiResilienceNotes}`);
  lines.push("");
  lines.push(`## Roles most often placed`);
  lines.push("");
  sample.forEach((r) => lines.push(`- ${r}`));
  lines.push("");
  if (meta.requiresLicense && meta.licensingNotes) {
    lines.push(`## Credentialing realities you can't optimize around`);
    lines.push("");
    lines.push(meta.licensingNotes);
    lines.push("");
    lines.push(
      `**Implication for recruiters:** verify licensure / credentialing status BEFORE the candidate hits the hiring manager. Unlike knowledge-work roles where an offer can be made contingent on a background check, in ${meta.label} an unlicensed candidate cannot legally start work — a single bad placement burns trust with the employer.`,
    );
    lines.push("");
  }
  lines.push(`## Sourcing channels that work`);
  lines.push("");
  lines.push(`- **hired.video sector feed** — candidates who have tagged themselves as targeting ${meta.label} surface in the [recruiter sector view](/recruiter/search?sector=${meta.slug}).`);
  if (meta.requiresLicense) {
    lines.push(`- **License-board public records** — most state licensing boards expose searchable rosters of active license-holders by specialty. Use these to verify candidates and to source passively.`);
  }
  lines.push(`- **Specialty associations + program directories** — alumni rosters from accredited programs (e.g. trade school placement offices, nursing school career services) are higher-signal than general job board scraping.`);
  lines.push("");
  lines.push(`## What to look for on a candidate's hired.video profile`);
  lines.push("");
  lines.push(`- Current licensure / credentialing dates (verifiable)`);
  lines.push(`- Hands-on hours / patient contact / on-tools time — not just years employed`);
  lines.push(`- Geographic reach (commute radius, willingness to relocate)`);
  lines.push(`- Video resume — first impression matters more in client/patient/public-facing roles than in knowledge work`);
  lines.push("");
  lines.push(`## Posting a ${meta.label} job`);
  lines.push("");
  lines.push(
    `Use the [Post a Job](/jobs/create) form and pick **${meta.label}** in the sector field. Sector-tagged listings surface on the sector landing page, in vertical search, and in the personalized feed for candidates who've expressed interest in this sector.`,
  );
  lines.push("");
  return {
    sector: meta.slug,
    audience: "recruiter",
    title: `Recruiting for ${meta.label}: A Practical Guide`,
    summary: `What's different about recruiting for ${meta.label} — credentialing, sourcing channels, and how to use the platform.`,
    tags: [meta.slug, "recruiters", "sourcing"],
    bodyMd: lines.join("\n"),
  };
}

function pivotArticle(meta: SectorMeta): SectorArticleDraft {
  const lines: string[] = [];
  lines.push(`# Pivoting from Tech to ${meta.label}`);
  lines.push("");
  lines.push(
    `If you're leaving software, IT, or another tech role because of AI displacement, role disappearance, or burnout — and you've identified ${meta.label} as a target — here's an honest read on the path.`,
  );
  lines.push("");
  lines.push(`## Why this is a credible pivot`);
  lines.push("");
  lines.push(`> ${meta.aiResilienceNotes}`);
  lines.push("");
  lines.push(`The roles inside ${meta.label} that aren't directly exposed to automation are exactly the ones a tech-leaving pivot should be targeting.`);
  lines.push("");
  lines.push(`## What you already bring`);
  lines.push("");
  if (meta.transferableFromTech.length === 0) {
    lines.push(
      `Tech-to-${meta.label} doesn't have a clean transferable-skills story — most of what you'd bring is general professionalism (communication, written process discipline, time management). That's not nothing, but don't overstate it on your resume.`,
    );
  } else {
    meta.transferableFromTech.forEach((s) => lines.push(`- **${s}**`));
  }
  lines.push("");
  if (meta.requiresLicense && meta.licensingNotes) {
    lines.push(`## What you have to acquire`);
    lines.push("");
    lines.push(meta.licensingNotes);
    lines.push("");
    lines.push(
      `**Time-to-employed estimate:** plan on this licensing/credentialing pipeline as the rate-limiter — not your resume polish, not your network, not your portfolio. The fastest path is the one that gets you legally employable.`,
    );
    lines.push("");
  } else {
    lines.push(`## What you have to acquire`);
    lines.push("");
    lines.push(
      `No formal license barrier, but expect platform-specific or employer-specific onboarding. Bridging income via [gig work](/articles?sector=gig_work) is a common stepping-stone while you ramp.`,
    );
    lines.push("");
  }
  lines.push(`## Order of operations`);
  lines.push("");
  lines.push(`1. **Verify the licensure path** for your state. Don't take national averages — costs and timelines vary 2–3x by state.`);
  lines.push(`2. **Pick a single role** as the entry target (one of: ${meta.exampleRoles.slice(0, 3).join(", ")}). Don't keep optionality across three role types — it will dilute your resume.`);
  lines.push(`3. **Use the [Pivot Explorer](/pivot-explorer)** to map your current skills against ${meta.label} entry roles and see the specific gap list.`);
  lines.push(`4. **Build a ${recommendedTemplateName(meta)} resume** in the [studio](/studio) — pivot-specific templates lead with the WHY, not the chronology.`);
  lines.push(`5. **Apply through hired.video** so your applications land in front of recruiters who've already filtered for ${meta.label} candidates open to pivots.`);
  lines.push("");
  return {
    sector: meta.slug,
    audience: "pivot",
    title: `Pivoting from Tech to ${meta.label}`,
    summary: `Honest roadmap for tech workers (engineers, IT, QA, PM) targeting ${meta.label} as their next career — transferable skills, credential gaps, and order of operations.`,
    tags: [meta.slug, "career-pivot", "tech-to-trades", "ai-resilience"],
    bodyMd: lines.join("\n"),
  };
}

function resumeGuideArticle(meta: SectorMeta): SectorArticleDraft {
  const template = recommendedTemplateName(meta);
  const lines: string[] = [];
  lines.push(`# Which Resume Template Should You Use for ${meta.label}?`);
  lines.push("");
  lines.push(
    `Short answer: the **${template}** template, available in the hired.video [studio](/studio).`,
  );
  lines.push("");
  lines.push(`## Why this template`);
  lines.push("");
  lines.push(resumeWhy(meta));
  lines.push("");
  lines.push(`## What sections to lead with`);
  lines.push("");
  resumeSections(meta).forEach((s) => lines.push(`- **${s}**`));
  lines.push("");
  lines.push(`## Common mistakes`);
  lines.push("");
  resumeMistakes(meta).forEach((s) => lines.push(`- ${s}`));
  lines.push("");
  lines.push(`## Video resume tips`);
  lines.push("");
  lines.push(
    meta.requiresLicense
      ? `For licensed ${meta.label} roles, your video resume should explicitly state your current licensure (number redacted, state and expiration date visible). Hiring managers screen for this in the first 10 seconds — putting it on-screen as a caption saves them the scroll.`
      : `For ${meta.label} roles, your video resume should demonstrate the actual work you do — on a job site, behind the wheel, in the chair, on the route. Talking-head videos underperform site-of-work videos by a wide margin in this sector.`,
  );
  lines.push("");
  lines.push(`## Other templates and when to use them`);
  lines.push("");
  lines.push(`- **video-resume-pivot-led** — use this if you're entering ${meta.label} from tech or another adjacent field. Leads with the WHY, then chronology.`);
  lines.push(`- **video-resume-professional** — generic; usable but not optimized for ${meta.label}.`);
  lines.push(`- **video-resume-story-led** — overkill for ${meta.label} in most cases; favor concrete credentials over narrative arc.`);
  lines.push("");
  return {
    sector: meta.slug,
    audience: "resume_guide",
    title: `Which Resume Template Should You Use for ${meta.label}?`,
    summary: `Template selection guide for ${meta.label} — which sections to lead with, what hiring managers screen for in the first 10 seconds, and video resume tips.`,
    tags: [meta.slug, "resume-template", "resume-guide"],
    bodyMd: lines.join("\n"),
  };
}

function civicArticle(meta: SectorMeta): SectorArticleDraft {
  const lines: string[] = [];
  lines.push(`# Running for Office`);
  lines.push("");
  lines.push(
    `${meta.label} is the only "sector" on hired.video that isn't a hiring marketplace — elected office is held, not hired. We carry this content because the same audience that pivots into AI-resilient work often also pivots into civic engagement, and the resume / video / community-building tools on this platform are useful regardless of whether you're seeking a paycheck or a ballot line.`,
  );
  lines.push("");
  lines.push(`## What "running for office" actually means`);
  lines.push("");
  lines.push(`There are four classes of elected office most first-time candidates target:`);
  lines.push("");
  meta.exampleRoles.forEach((r) => lines.push(`- **${r}**`));
  lines.push("");
  lines.push(`## Where to start`);
  lines.push("");
  lines.push(`1. **Identify the office.** School board and city council races are the highest-leverage entry points for most candidates — lower filing thresholds, smaller electorates, more meaningful policy impact per vote.`);
  lines.push(`2. **Check your jurisdiction's filing rules.** Petition signatures, filing fee, residency duration, and ballot deadlines all vary by state and office. Your county elections office is the authoritative source — not Wikipedia, not a national how-to guide.`);
  lines.push(`3. **Read your jurisdiction's budget.** You can't credibly run on policy without knowing what your governing body actually decides. School board budgets, city budgets, and county budgets are public documents.`);
  lines.push(`4. **Build your candidate video.** First-time candidates underuse video. The hired.video [studio](/studio) is suitable for candidate intros, town-hall recap clips, and policy explainers.`);
  lines.push("");
  lines.push(`## What hired.video does and doesn't do here`);
  lines.push("");
  lines.push(`**Does:** host your candidate video, your policy-position articles, your "about me" page that links from your campaign website.`);
  lines.push("");
  lines.push(`**Doesn't:** advise on campaign finance compliance (talk to an election lawyer), run get-out-the-vote operations, or sell voter data. We're not an FEC-registered service.`);
  lines.push("");
  lines.push(`## Related reading`);
  lines.push("");
  lines.push(`- [Pivoting from Tech to Politics & Campaigns](/articles?sector=politics_campaigns&audience=pivot) — for staff-side career paths`);
  lines.push(`- [Recruiting for Politics & Campaigns](/articles?sector=politics_campaigns&audience=recruiter) — for campaign managers building staffs`);
  lines.push("");
  return {
    sector: meta.slug,
    audience: "civic",
    title: `Running for Office: A Practical First-Time Candidate Guide`,
    summary: `Education-only guide for first-time candidates targeting school board, city council, county commission, or state legislative seats.`,
    tags: [meta.slug, "civic", "elected-office", "first-time-candidate"],
    bodyMd: lines.join("\n"),
  };
}

// ──────────────────────────────────────────────────────────────────────
// Helpers for resume-section recommendations
// ──────────────────────────────────────────────────────────────────────

function recommendedTemplateName(meta: SectorMeta): string {
  switch (meta.slug) {
    case "healthcare":
      return "video-resume-medical-credentialed";
    case "legal":
      return "video-resume-legal-bar";
    case "law_enforcement":
      return "video-resume-law-enforcement";
    case "government":
      return "video-resume-government-clearance";
    case "security":
      return "video-resume-security-cleared";
    case "skilled_trades":
      return "video-resume-trade-licensed";
    case "beauty_personal_care":
      return "video-resume-beauty-portfolio";
    case "gig_work":
      return "video-resume-gig-rapid-deploy";
    case "politics_campaigns":
      return "video-resume-campaign-staff";
    case "politics_civic":
      return "video-resume-candidate-intro";
    case "tech":
      return "video-resume-professional";
  }
}

function resumeWhy(meta: SectorMeta): string {
  if (meta.requiresLicense) {
    return `Hiring managers in ${meta.label} screen for licensure FIRST, then experience. A generic resume buries the credential at the bottom; the recommended template surfaces license number, state, and expiration above the fold so the hiring manager doesn't have to dig.`;
  }
  return `${meta.label} hiring managers care most about reliability and concrete capability, not credentials. The recommended template leads with deployment readiness — "available immediately, vehicle inspected, background ran" — rather than a chronology of past employers.`;
}

function resumeSections(meta: SectorMeta): string[] {
  if (meta.requiresLicense) {
    return [
      "Licensure & Credentials — state, license number (truncated), expiration date",
      "Specialty & Hands-On Hours — patient contact hours / on-tools hours / shifts worked",
      "Employment History — most recent first, no gaps unexplained",
      "Continuing Education / Certifications",
      "References (license-board verifiable preferred)",
    ];
  }
  return [
    "Availability & Coverage — what shifts, what radius, what start date",
    "Recent Engagements — most recent first, with platform / employer / dates",
    "Reliability Signals — driving record, background check status, equipment ownership",
    "Skills & Specialty Endorsements",
    "References (recent supervisors or platform ratings)",
  ];
}

function resumeMistakes(meta: SectorMeta): string[] {
  const common = [
    "Burying the credential / licensure section at the bottom of the resume",
    "Using a tech-industry chronology format that emphasizes job-hopping",
    "Including a hobbies section longer than the experience section",
  ];
  if (meta.slug === "skilled_trades") {
    common.push("Listing union and non-union experience without distinguishing them — IBEW vs. open-shop matters to a lot of employers");
  }
  if (meta.slug === "healthcare") {
    common.push("Listing every CEU / continuing-ed credit instead of the ones relevant to the specialty you're applying to");
  }
  if (meta.slug === "law_enforcement") {
    common.push("Including specific case details on a public resume — keep these for the interview");
  }
  return common;
}

function aiResilienceQualifier(meta: SectorMeta): string {
  switch (meta.aiResilience) {
    case "high":
      return " — meaning the durable roles in this sector are physically rooted in the real world and not directly automatable today";
    case "medium":
      return " — meaning the sector has BOTH durable in-person roles AND knowledge-work roles being actively automated; pick carefully";
    case "low":
      return " — meaning most roles in this sector ARE exposed to AI; we include it here for completeness and for pivots OUT of it";
  }
}

// ──────────────────────────────────────────────────────────────────────
// Public renderers
// ──────────────────────────────────────────────────────────────────────

export function renderSectorArticle(
  sector: Sector,
  audience: ArticleAudience,
): SectorArticleDraft | null {
  const meta = sectorMeta(sector);
  if (audience === "civic") {
    return meta.slug === "politics_civic" ? civicArticle(meta) : null;
  }
  if (meta.slug === "politics_civic") {
    // The civic sector only has the civic article — no job-seeker /
    // recruiter / pivot / resume_guide variants (no hiring marketplace).
    return null;
  }
  if (meta.slug === "tech" && audience === "pivot") {
    // No "pivoting INTO tech" article — tech is the "from" side of the
    // canonical pivot funnel.
    return null;
  }
  switch (audience) {
    case "job_seeker":
      return jobSeekerArticle(meta);
    case "recruiter":
      return recruiterArticle(meta);
    case "pivot":
      return pivotArticle(meta);
    case "resume_guide":
      return resumeGuideArticle(meta);
  }
}

/**
 * Every sector × audience pair that has a real article. Used by the
 * seed script + any "regenerate sector content" admin tool.
 */
export function allSectorArticleDrafts(): SectorArticleDraft[] {
  const out: SectorArticleDraft[] = [];
  // Recruitable sectors: 4 audiences each, minus the pivot-into-tech null
  const recruitableMetaList = pivotTargetSectors().concat(sectorMeta("tech"));
  for (const meta of recruitableMetaList) {
    for (const audience of ["job_seeker", "recruiter", "pivot", "resume_guide"] as const) {
      const draft = renderSectorArticle(meta.slug, audience);
      if (draft) out.push(draft);
    }
  }
  // politics_civic: one civic article only
  const civic = renderSectorArticle("politics_civic", "civic");
  if (civic) out.push(civic);
  return out;
}
