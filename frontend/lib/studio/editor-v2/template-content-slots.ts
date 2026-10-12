/**
 * Template content-slot bindings — declares, per template, which strings in
 * the seeded canvas (`template-seeds.ts`) are replaced with which fields from
 * the user's content, and which content families the template reads.
 *
 * Why a separate file: catalog.tsx is layout-side (icons + intake forms);
 * template-seeds.ts is structural (positions + colours); slot bindings
 * are a third concern (content mapping). Splitting keeps the dependency
 * graph honest — the slot file imports the user-content snapshot type,
 * which catalog.tsx must not pull into the React component tree.
 *
 * The seeds carry REALISTIC sample copy (not `[bracket]` tokens), so each
 * slot's `placeholder` is that exact sample string — the test pins every
 * placeholder to its seed so a copy edit there can't silently unbind a slot.
 *
 * DRY: every "AI fills the template with the user's content" path —
 * the AI CHRO tool, future deep-links, future bulk-generate flows —
 * resolves bindings through this file. A slot whose value is missing keeps
 * the seed's text, so partial content degrades gracefully. Registry data —
 * one entry per template, no per-template branches (#689).
 */

import type { ContentTemplate } from "@/lib/studio/templates/catalog";
import type { ContentSource, UserContentSnapshot } from "./resolve-user-content";

export interface TemplateSlot {
  /** The exact sample string in the seeded canvas. Every occurrence across
   *  the text / heading / CTA / chip fields is replaced. */
  placeholder: string;
  /** Read the slot value from the resolved user-content snapshot.
   *  Returning `undefined` (or an empty string) leaves the seed text
   *  intact, so partial bindings degrade gracefully. */
  read: (uc: UserContentSnapshot) => string | undefined;
  /** Replace only a field that IS the placeholder (chips like "Go" or
   *  "React" would otherwise match inside other words). */
  whole?: boolean;
}

export interface TemplateBinder {
  /** Content beyond the profile + résumé that the slots read — loaded only
   *  for templates that need it (resolveUserContent `sources`). */
  sources: readonly ContentSource[];
  slots: readonly TemplateSlot[];
}

/** The twelve templates with their own intake (catalog `TemplateIntakeId`,
 *  minus the comic shelf) — each has a binder. */
export const SLOT_TEMPLATES = [
  "basic",
  "profile",
  "resume",
  "personal_brand",
  "skills_demo",
  "code_walkthrough",
  "design_portfolio",
  "data_analysis",
  "job_ad",
  "company_promo",
  "sizzle_reel",
  "tool_promo",
] as const satisfies readonly ContentTemplate[];
export type SlotTemplate = (typeof SLOT_TEMPLATES)[number];

// ── Readers (pure helpers the slot table composes) ───────────────────────────

const present = (v: string | undefined | null): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;

/** "• a\n• b\n• c" from up to `n` non-empty lines. */
function bullets(lines: readonly (string | undefined)[], n = 3): string | undefined {
  const picked = lines.map(present).filter((l): l is string => !!l).slice(0, n);
  return picked.length > 0 ? picked.map((l) => `• ${l}`).join("\n") : undefined;
}

/** "https://x.com/a/" → "x.com/a" (the CTA's display line). */
function hostPath(url: string | undefined): string | undefined {
  return present(url)?.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

const name = (uc: UserContentSnapshot) => present(uc.profile?.name) ?? present(uc.resume?.basics?.name);
const role = (uc: UserContentSnapshot) => present(uc.resume?.basics?.label) ?? present(uc.profile?.currentRole);
const headline = (uc: UserContentSnapshot) => present(uc.profile?.headline) ?? present(uc.resume?.basics?.summary);
const skill = (i: number) => (uc: UserContentSnapshot) => present(uc.resume?.skills?.[i]?.name);
const email = (uc: UserContentSnapshot) => present(uc.profile?.email) ?? present(uc.resume?.basics?.email);
const siteUrl = (uc: UserContentSnapshot) => present(uc.resume?.basics?.url) ?? present(uc.profile?.publicProfileUrl);

/** The résumé's strongest lines: work highlights, else "Company — Role". */
function careerBullets(uc: UserContentSnapshot): string | undefined {
  const work = uc.resume?.work ?? [];
  const highlights = work.flatMap((w) => w.highlights ?? []);
  if (highlights.length > 0) return bullets(highlights);
  return bullets(work.map((w) => (w.name || w.position ? `${w.name || "—"} — ${w.position || "—"}` : undefined)));
}

function joinDot(...parts: (string | undefined)[]): string | undefined {
  const kept = parts.map(present).filter((p): p is string => !!p);
  return kept.length > 0 ? kept.join(" · ") : undefined;
}

/** "$160k–$210k" from a posting's range (compact, in its currency). */
function salaryRange(uc: UserContentSnapshot): string | undefined {
  const job = uc.job;
  if (!job || (job.salaryMin === undefined && job.salaryMax === undefined)) return undefined;
  const fmt = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: job.currency || "USD",
    notation: "compact",
    maximumFractionDigits: 0,
  });
  const lo = job.salaryMin !== undefined ? fmt.format(job.salaryMin) : undefined;
  const hi = job.salaryMax !== undefined ? fmt.format(job.salaryMax) : undefined;
  return lo && hi ? `${lo}–${hi}` : lo ?? hi;
}

/** The featured project (i = 0), then the résumé's other named projects. */
const project = (i: number) => (uc: UserContentSnapshot) =>
  i === 0
    ? uc.project
    : (uc.resume?.projects ?? []).filter((p) => p.name?.trim() && p.name !== uc.project?.name)[i - 1];

// ── The registry ─────────────────────────────────────────────────────────────

export const TEMPLATE_BINDERS: Record<SlotTemplate, TemplateBinder> = {
  basic: {
    sources: [],
    slots: [
      { placeholder: "One scene, one idea.", read: headline },
      { placeholder: "Type a prompt — get a video.", read: (uc) => joinDot(name(uc), role(uc)) },
    ],
  },

  profile: {
    sources: [],
    slots: [
      { placeholder: "Alex Rivera", read: name, whole: true },
      { placeholder: "Product Designer · San Francisco", read: (uc) => joinDot(role(uc), uc.profile?.location) },
      { placeholder: "Designing tools that help people get back time.", read: headline },
      {
        placeholder:
          "• Lead end-to-end product design for B2B SaaS\n• Ship from research → prototype → production\n• Pair with PMs + engineers daily",
        read: careerBullets,
      },
      { placeholder: "Design audits", read: skill(0), whole: true },
      { placeholder: "0-to-1 prototypes", read: skill(1), whole: true },
      { placeholder: "Design systems", read: skill(2), whole: true },
      { placeholder: "Workshops", read: skill(3), whole: true },
      { placeholder: "mailto:alex@rivera.design", read: (uc) => (email(uc) ? `mailto:${email(uc)}` : undefined) },
      { placeholder: "alex@rivera.design", read: email },
    ],
  },

  resume: {
    sources: [],
    slots: [
      { placeholder: "Jordan Park", read: name, whole: true },
      { placeholder: "Senior Backend Engineer", read: role, whole: true },
      { placeholder: "Eight years building distributed systems at scale.", read: (uc) => present(uc.resume?.basics?.summary) },
      {
        placeholder:
          "• Took payments throughput from 800/s → 14k/s\n• Led migration off monolith for 60-engineer team\n• Cut p99 latency 38% on the auth service",
        read: careerBullets,
      },
      { placeholder: "Go", read: skill(0), whole: true },
      { placeholder: "Postgres", read: skill(1), whole: true },
      { placeholder: "Kafka", read: skill(2), whole: true },
      { placeholder: "Kubernetes", read: skill(3), whole: true },
      { placeholder: "gRPC", read: skill(4), whole: true },
      { placeholder: "Observability", read: skill(5), whole: true },
    ],
  },

  personal_brand: {
    sources: [],
    slots: [
      { placeholder: "I rebuild careers.", read: headline },
      { placeholder: "Coach · Author · Operator", read: role, whole: true },
      {
        placeholder:
          "• 400+ professionals coached into senior roles\n• Best-selling course on career pivots\n• Featured in WSJ, Fast Company, The Information",
        read: careerBullets,
      },
      { placeholder: "https://rivera-coaching.com", read: siteUrl },
      { placeholder: "rivera-coaching.com", read: (uc) => hostPath(siteUrl(uc)) },
    ],
  },

  skills_demo: {
    sources: [],
    slots: [
      { placeholder: "TypeScript", read: skill(0), whole: true },
      { placeholder: "React", read: skill(1), whole: true },
      { placeholder: "Node", read: skill(2), whole: true },
      { placeholder: "Postgres", read: skill(3), whole: true },
      { placeholder: "AWS", read: skill(4), whole: true },
      { placeholder: "Terraform", read: skill(5), whole: true },
      {
        placeholder:
          "• TypeScript → cut runtime bugs 60% on checkout\n• Terraform → onboarding 3 days → 2 hours\n• Postgres tuning → query p99 down 5×",
        // Each top skill paired with where it was used.
        read: (uc) => {
          const work = uc.resume?.work ?? [];
          return bullets(
            (uc.resume?.skills ?? []).slice(0, 3).map((s, i) => {
              const where = work[i] ?? work[0];
              const place = where ? present(where.name) ?? present(where.position) : undefined;
              return present(s.name) ? (place ? `${s.name} → ${place}` : s.name) : undefined;
            }),
          );
        },
      },
    ],
  },

  code_walkthrough: {
    sources: [],
    slots: [
      { placeholder: "How it actually works.", read: (uc) => (uc.project ? `How ${uc.project.name} works.` : undefined) },
      { placeholder: "A 30-second walk through the core loop.", read: (uc) => present(uc.project?.description) },
      { placeholder: "https://github.com/yourname/project", read: (uc) => present(uc.project?.url) },
      { placeholder: "github.com/yourname/project", read: (uc) => hostPath(uc.project?.url) },
    ],
  },

  design_portfolio: {
    sources: [],
    slots: [
      { placeholder: "Mira Chen · Product Designer", read: (uc) => joinDot(name(uc), role(uc)) },
      { placeholder: "Healthcare scheduling redesign", read: (uc) => present(project(0)(uc)?.name) },
      {
        placeholder: "Cut booking abandonment from 41% to 17% across 1.2M monthly visits.",
        read: (uc) => present(project(0)(uc)?.description),
      },
      { placeholder: "Banking onboarding system", read: (uc) => present(project(1)(uc)?.name) },
      {
        placeholder: "Shipped a 14-screen flow in 9 weeks. Conversion +28% vs control.",
        read: (uc) => present(project(1)(uc)?.description),
      },
      { placeholder: "https://mirachen.design", read: siteUrl },
      { placeholder: "mirachen.design", read: (uc) => hostPath(siteUrl(uc)) },
    ],
  },

  data_analysis: {
    sources: [],
    slots: [
      {
        placeholder: "Q3 — what the numbers said.",
        read: (uc) => (uc.project ? `${uc.project.name} — what the numbers said.` : undefined),
      },
      {
        placeholder:
          "• Activation rate up 22% MoM across 14 cohorts\n• Churn concentrated in the 7-day post-trial window\n• Two pricing pages drive 71% of paid conversions",
        read: (uc) => bullets(uc.project?.highlights ?? []),
      },
      {
        placeholder: "We rebuilt the trial-to-paid prompt and re-ordered the pricing grid.",
        read: (uc) => present(uc.project?.description),
      },
    ],
  },

  job_ad: {
    sources: ["job"],
    slots: [
      { placeholder: "Senior Full-Stack Engineer · Remote", read: (uc) => joinDot(uc.job?.title, uc.job?.location) },
      {
        placeholder:
          "• Own the candidate-facing product end to end\n• Pair with design weekly, ship every Tuesday\n• TypeScript / React / Node / Postgres",
        read: (uc) => bullets(uc.job?.responsibilities ?? []),
      },
      { placeholder: "$160k–$210k", read: salaryRange, whole: true },
      { placeholder: "Equity", read: (uc) => present(uc.job?.benefits[0]), whole: true },
      { placeholder: "Remote-first", read: (uc) => present(uc.job?.benefits[1]), whole: true },
      { placeholder: "Unlimited PTO", read: (uc) => present(uc.job?.benefits[2]), whole: true },
      { placeholder: "4-day weeks", read: (uc) => present(uc.job?.benefits[3]), whole: true },
      { placeholder: "https://jobs.example.com/se", read: (uc) => present(uc.job?.applyUrl) },
      { placeholder: "jobs.example.com/se", read: (uc) => hostPath(uc.job?.applyUrl) },
    ],
  },

  company_promo: {
    sources: ["company"],
    slots: [
      { placeholder: "Build with us.", read: (uc) => (uc.company ? `Build with ${uc.company.name}.` : undefined) },
      {
        placeholder: "ACME · Series B · 60 engineers",
        read: (uc) => joinDot(uc.company?.name, uc.company?.industry, uc.company?.size),
      },
      {
        placeholder: "• Async-first, two synchronous hours/day\n• Ship to prod from day one\n• Outcomes over output — always",
        read: (uc) => bullets(uc.company?.culture ?? []),
      },
      { placeholder: "Top-of-market comp", read: (uc) => present(uc.company?.perks[0]), whole: true },
      { placeholder: "Equity", read: (uc) => present(uc.company?.perks[1]), whole: true },
      { placeholder: "Remote-first", read: (uc) => present(uc.company?.perks[2]), whole: true },
      { placeholder: "Learning budget", read: (uc) => present(uc.company?.perks[3]), whole: true },
      { placeholder: "https://acme.co/careers", read: (uc) => present(uc.company?.url) },
      { placeholder: "acme.co/careers", read: (uc) => hostPath(uc.company?.url) },
    ],
  },

  sizzle_reel: {
    sources: ["clips"],
    slots: [
      { placeholder: "Sizzle Reel", read: name, whole: true },
      {
        placeholder: "Three minutes of the best moments — in twenty seconds.",
        read: (uc) => joinDot(...(uc.clips ?? []).map((c) => c.title)),
      },
      { placeholder: "https://hired.video/studio", read: siteUrl },
    ],
  },

  tool_promo: {
    sources: [],
    slots: [
      { placeholder: "New Tool Drop", read: (uc) => present(uc.tool?.label), whole: true },
      {
        placeholder: "Turn raw recordings into shareable videos — captions, music, and end-cap included.",
        read: (uc) => present(uc.tool?.description),
      },
      { placeholder: "https://hired.video/tools", read: (uc) => present(uc.tool?.url) },
      { placeholder: "hired.video/tools", read: (uc) => hostPath(uc.tool?.url) },
    ],
  },
};

function isSlotTemplate(id: string): id is SlotTemplate {
  return (SLOT_TEMPLATES as readonly string[]).includes(id);
}

/** The binder for a template, or null when it has none (comics, games …). */
export function templateBinder(templateId: ContentTemplate): TemplateBinder | null {
  return isSlotTemplate(templateId) ? TEMPLATE_BINDERS[templateId] : null;
}

/** Slot bindings keyed by ContentTemplate (the hydrator's view). */
export const TEMPLATE_SLOTS: Partial<Record<ContentTemplate, readonly TemplateSlot[]>> = Object.fromEntries(
  SLOT_TEMPLATES.map((id) => [id, TEMPLATE_BINDERS[id].slots]),
);
