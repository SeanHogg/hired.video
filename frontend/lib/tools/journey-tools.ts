/**
 * AI-callable runners for the tools on the kit's Create → Promote journey
 * that used to be page-only: Roast, Career 360, Employer Research, Salary,
 * Video Pitch script, Profile Audit and the LinkedIn / profile-sync blocks.
 * Each calls the SAME endpoint (via its typed client where one exists) its
 * /tools page calls, reads the résumé through the shared content port (so on
 * the kit workspace it sees the open draft), and returns the shared result shape. None
 * mutate: the AI applies what they suggest with the résumé mutation tools
 * (apply_resume_rewrite, update_resume_summary, add_resume_skill), one Undo
 * step each — and `edit_resume_video_scene` edits the résumé video's plan
 * (stored on the résumé at `content.meta.video`), so on the kit workspace the AI's
 * wording / voiceover / scene changes land on the video as Undo steps too.
 *
 * Kept out of registry.ts (already the largest file in the tools layer);
 * the registry spreads `journeyTools` in.
 */
import type { QueryClient } from "@tanstack/react-query";
import { Building2, Calculator, Clapperboard, Compass, Flame, Gauge, Share2, UserCheck, Video } from "lucide-react";
import { slugify } from "@shared/slugify";
import {
  ScenePlanSchema,
  VIDEO_SCENE_IDS,
  isLastSceneOn,
  patchScenePlan,
  readVideoPlan,
  withVideoPlan,
  type VideoSceneId,
} from "@shared/video-plan";
import { apiClient } from "@/lib/api-client";
import { career360Service } from "@/lib/services/career360-service";
import { companyService } from "@/lib/services/company-service";
import { profileAuditService } from "@/lib/services/profile-audit-service";
import { vendorSyncService } from "@/lib/services/vendor-sync-service";
import { generatePitchScript } from "@/lib/services/video-pitch-service";
import { valuePropositionService } from "@/lib/services/value-proposition-service";
import { readResumeContent, resolveResumeText, writeResumeContent } from "./resume-content";
import type { NormalizedToolRunResult, ToolDefinition, ToolRunContext } from "./types";

const NO_ARGS = { type: "object", properties: {}, additionalProperties: false } as const;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

interface RoastResponse {
  score: number;
  strengths: string[];
  weaknesses: string[];
  roast: string;
  fixes: string[];
  improvedExamples: Array<{ original: string; improved: string }>;
}

async function runRoast(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const resumeText = await resolveResumeText(ctx);
  const { data } = await apiClient.post<RoastResponse>("/api/resume/roast", { resumeText });
  return {
    overallScore: data.score,
    summary: data.roast,
    strengths: data.strengths,
    weaknesses: data.weaknesses,
    recommendations: [
      ...data.fixes.map((title) => ({ title })),
      ...data.improvedExamples.map((ex) => ({ title: ex.improved, description: ex.original })),
    ],
    raw: data,
  };
}

async function runCareerTargets(): Promise<NormalizedToolRunResult> {
  const suggestions = await career360Service.suggest();
  return {
    summary: suggestions.map((s) => s.title).join(" · "),
    recommendations: suggestions.map((s) => ({ title: s.title, description: s.why })),
    extras: suggestions.map((s) => ({ label: s.title, value: `${s.timelineMonths} months` })),
    raw: suggestions,
  };
}

interface SalaryStats {
  averageSalary?: number;
  minSalary?: number;
  maxSalary?: number;
  sampleSize?: number;
}

async function runEmployerResearch(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const company = str(ctx.args.company);
  const role = str(ctx.args.role);
  const city = str(ctx.args.city);
  if (!company && !role) throw new Error("Employer research needs a company name or a role.");

  const [companies, salary] = await Promise.all([
    company ? companyService.searchCompanies({ search: company, page: 1, limit: 3 }).then((r) => r.items ?? []) : [],
    role
      ? apiClient
          .get<SalaryStats>(
            city
              ? `/api/discovery/seo/salary/${slugify(role, { fallback: "role" })}/${slugify(city, { fallback: "city" })}`
              : `/api/discovery/seo/salary/${slugify(role, { fallback: "role" })}`,
          )
          .then((r) => r.data)
          .catch(() => null)
      : null,
  ]);

  const extras = companies.map((c) => ({
    label: c.name ?? "",
    value: [c.industry, (c as { reviewAvgOverall?: number }).reviewAvgOverall?.toFixed(1)].filter(Boolean).join(" · "),
  }));
  if (salary?.averageSalary) {
    extras.push({
      label: [role, city].filter(Boolean).join(", "),
      value: `$${Math.round(salary.minSalary ?? 0).toLocaleString()} – $${Math.round(salary.maxSalary ?? 0).toLocaleString()} (avg $${Math.round(salary.averageSalary).toLocaleString()}, ${salary.sampleSize ?? 0} postings)`,
    });
  }
  return { extras, raw: { companies, salary } };
}

interface SalaryAnalysis {
  medianSalary?: number;
  salaryRange?: { min: number; max: number };
  negotiationRange?: { conservative: number; target: number; aggressive: number };
  skillsPremium?: Array<{ skill: string; premium: number }>;
}

async function runSalary(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const jobTitle = str(ctx.args.jobTitle);
  if (!jobTitle) throw new Error("Salary analysis needs a job title.");
  const { data } = await apiClient.post<SalaryAnalysis>("/api/salaryanalyzer/analyze", {
    jobTitle,
    location: str(ctx.args.location),
    industry: str(ctx.args.industry),
    yearsExperience: typeof ctx.args.yearsExperience === "number" ? ctx.args.yearsExperience : undefined,
  });
  const money = (n?: number) => (typeof n === "number" ? `$${Math.round(n).toLocaleString()}` : "—");
  return {
    summary: `${jobTitle}: median ${money(data.medianSalary)}`,
    extras: [
      { label: "Range", value: `${money(data.salaryRange?.min)} – ${money(data.salaryRange?.max)}` },
      ...(data.negotiationRange
        ? [{ label: "Ask for", value: `${money(data.negotiationRange.target)} (up to ${money(data.negotiationRange.aggressive)})` }]
        : []),
      ...(data.skillsPremium ?? []).slice(0, 4).map((s) => ({ label: s.skill, value: `+${s.premium}%` })),
    ],
    raw: data,
  };
}

const PITCH_LENGTHS = [30, 60, 90] as const;
const PITCH_TONES = ["casual", "professional", "enthusiastic"] as const;

async function runPitchScript(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const length = PITCH_LENGTHS.find((l) => l === ctx.args.length) ?? 60;
  const tone = PITCH_TONES.find((t) => t === ctx.args.tone) ?? "professional";
  const { script, targetWordCount } = await generatePitchScript({ resumeId: ctx.bound.resumeId, length, tone });
  return { summary: script, extras: [{ label: "Target", value: `${length}s · ~${targetWordCount} words` }], raw: { script } };
}

async function runValueProposition(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const jobContent = str(ctx.args.jobDescription);
  if (!jobContent || jobContent.length < 20) throw new Error("A value proposition needs the job description (20+ characters).");
  const out = await valuePropositionService.generate({
    jobContent,
    resumeContent: await resolveResumeText(ctx),
    companyName: str(ctx.args.companyName),
    companyMission: str(ctx.args.companyMission),
    companyValues: str(ctx.args.companyValues),
  });
  return {
    overallScore: Math.round(out.confidenceScore * 100),
    summary: out.valueProposition,
    strengths: out.keyStrengths,
    recommendations: out.alignmentPoints.map((title) => ({ title })),
    extras: [
      { label: "Executive summary", value: out.executiveSummary },
      { label: "Call to action", value: out.callToAction },
    ],
    raw: out,
  };
}

async function runProfileAudit(): Promise<NormalizedToolRunResult> {
  const audit = await profileAuditService.run();
  return {
    overallScore: audit.score,
    summary: audit.rationales.topFix,
    extras: [
      { label: "Suggested headline", value: audit.proposed.headline },
      { label: "Suggested summary", value: audit.proposed.summary },
    ],
    recommendations: audit.checks
      .filter((c) => c.status !== "pass")
      .map((c) => ({ title: c.label, description: c.detail, category: c.status === "fail" ? "critical" : "important" })),
    raw: audit,
  };
}

async function runProfileBlocks(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const { resumeId } = ctx.bound;
  if (!resumeId) throw new Error("No active resume — open a resume to prepare profile blocks.");
  const connectorId = str(ctx.args.connectorId) ?? "linkedin";
  const out = await vendorSyncService.renderBlocks(connectorId, resumeId);
  return {
    summary: `Paste-ready ${connectorId} profile blocks from "${out.resumeTitle}".`,
    extras: out.blocks.map((b) => ({ label: b.subSection ? `${b.section} — ${b.subSection}` : b.section, value: b.text })),
    raw: out,
  };
}

// ── The résumé video (the kit workspace): one scene's wording, voiceover or on/off ──

const VIDEO_EDIT_KIND = "edit_resume_video_scene";

interface SceneEdit {
  title?: string;
  lines?: string[];
  voiceover?: string;
  off?: boolean;
}

function sceneEdit(args: Record<string, unknown>): SceneEdit {
  const edit: SceneEdit = {};
  if (typeof args.title === "string") edit.title = args.title.trim();
  if (Array.isArray(args.lines)) edit.lines = args.lines.filter((l): l is string => typeof l === "string").map((l) => l.trim());
  if (typeof args.voiceover === "string") edit.voiceover = args.voiceover.trim();
  if (typeof args.on === "boolean") edit.off = !args.on;
  const parsed = ScenePlanSchema.safeParse(edit);
  if (!parsed.success) throw new Error(`Scene edit doesn't fit the video: ${parsed.error.issues[0]?.message ?? "invalid"}.`);
  if (Object.keys(edit).length === 0) throw new Error("Pass at least one of title, lines, voiceover or on.");
  return edit;
}

/** Only the fields the AI set — patchScenePlan treats `undefined` as "clear",
 *  so an omitted `off` must not be sent (it would un-hide a hidden scene). */
function scenePatch(edit: SceneEdit): Record<string, unknown> {
  const { off, ...wording } = edit;
  return off === undefined ? wording : { ...wording, off: off || undefined };
}

async function runEditVideoScene(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const { resumeId } = ctx.bound;
  if (!resumeId) throw new Error("No active resume — open a resume to edit its video.");
  const sceneId = VIDEO_SCENE_IDS.find((id) => id === ctx.args.sceneId);
  if (!sceneId) throw new Error(`sceneId must be one of ${VIDEO_SCENE_IDS.join(", ")}.`);
  const edit = sceneEdit(ctx.args);
  const content = await readResumeContent(resumeId);
  if (!content) throw new Error("Resume content unavailable.");
  if (edit.off && isLastSceneOn(readVideoPlan(content), sceneId)) {
    throw new Error("The video needs at least one scene — turn another one on first.");
  }
  const preview = [
    edit.title !== undefined && `Title: ${edit.title}`,
    edit.lines && `Lines:\n${edit.lines.map((l) => `• ${l}`).join("\n")}`,
    edit.voiceover !== undefined && `Voiceover: ${edit.voiceover}`,
    edit.off !== undefined && (edit.off ? "Leave this scene out" : "Show this scene"),
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    summary: `Edit the "${sceneId}" scene of your résumé video.`,
    previewText: preview,
    mutation: { status: "pending", location: `video.${sceneId}` },
    raw: { kind: VIDEO_EDIT_KIND, resumeId, sceneId, edit },
  };
}

/**
 * Apply a pending journey-tool mutation. Returns null for results that
 * aren't one of these tools' (the registry's commitMutation handles them).
 */
export async function commitJourneyMutation(
  result: NormalizedToolRunResult,
  queryClient?: QueryClient,
): Promise<NormalizedToolRunResult | null> {
  const raw = (result.raw ?? {}) as { kind?: string; resumeId?: string; sceneId?: VideoSceneId; edit?: SceneEdit };
  if (raw.kind !== VIDEO_EDIT_KIND) return null;
  if (!raw.resumeId || !raw.sceneId || !raw.edit) throw new Error("Missing scene edit.");
  const { sceneId, edit } = raw;
  await writeResumeContent(
    raw.resumeId,
    (copy) => withVideoPlan(copy, patchScenePlan(readVideoPlan(copy), sceneId, scenePatch(edit))),
    "ai:video",
    queryClient,
  );
  return { ...result, mutation: { status: "applied", location: `video.${sceneId}` } };
}

export const journeyTools: ToolDefinition[] = [
  {
    id: VIDEO_EDIT_KIND,
    label: "Edit video scene",
    description:
      "Edit one scene of the video made from the active resume (in the studio workspace). Scenes, in order: hook (opening line), who (name + title), proof (key roles/results), skills, next (the role wanted + contact). Set any of: title (on-screen headline, ≤160 chars), lines (up to 3 on-screen lines, ≤160 chars each), voiceover (what the narrator says, ≤600 chars), on (false leaves the scene out). Setting a title or lines unlinks that scene's wording from the résumé text. Use after the user agrees to the wording.",
    icon: Clapperboard,
    accentClassName: "bg-indigo-100 text-indigo-600",
    route: "/studio/new",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        sceneId: { type: "string", enum: [...VIDEO_SCENE_IDS], description: "Which scene to edit." },
        title: { type: "string", description: "On-screen headline." },
        lines: { type: "array", items: { type: "string" }, maxItems: 3, description: "On-screen lines." },
        voiceover: { type: "string", description: "Narration for this scene." },
        on: { type: "boolean", description: "false leaves the scene out of the video; true puts it back." },
      },
      required: ["sceneId"],
      additionalProperties: false,
    },
    run: runEditVideoScene,
  },
  {
    id: "resume-roast",
    label: "Resume Roast",
    description:
      "Brutally honest critique of the active resume: a 0–100 score, the roast, strengths, weaknesses, concrete fixes, and before/after rewrites of weak lines. Apply a rewrite with apply_resume_rewrite after the user agrees.",
    icon: Flame,
    accentClassName: "bg-orange-100 text-orange-600",
    route: "/tools/resume-roast",
    inputs: ["resume"],
    producesScore: true,
    parameters: NO_ARGS,
    run: runRoast,
  },
  {
    id: "career-360",
    label: "Career 360",
    description:
      "Suggest 1–5 realistic next roles for the user (from their profile and master resume), each with why it fits and a timeline. Use before targeting a job when the user is unsure what to aim for.",
    icon: Compass,
    accentClassName: "bg-violet-100 text-violet-600",
    route: "/tools/career-360",
    inputs: ["resume"],
    parameters: NO_ARGS,
    run: runCareerTargets,
  },
  {
    id: "employer-research",
    label: "Employer Research",
    description:
      "Look up a company (industry, review rating) and the pay range for a role, optionally in a city, from hired.video's own data. Pass at least a company or a role.",
    icon: Building2,
    accentClassName: "bg-slate-100 text-slate-600",
    route: "/tools/employer-research",
    inputs: ["company", "job"],
    parameters: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name to look up." },
        role: { type: "string", description: "Role title for the pay range, e.g. \"CTO\"." },
        city: { type: "string", description: "Optional city for the pay range." },
      },
      additionalProperties: false,
    },
    run: runEmployerResearch,
  },
  {
    id: "salary-calculator",
    label: "Salary Calculator",
    description:
      "Market pay for a role: median, range, a negotiation target and the skills that raise pay. Use the user's résumé for job title, location and years of experience when they don't say.",
    icon: Calculator,
    accentClassName: "bg-emerald-100 text-emerald-600",
    route: "/tools/salary-calculator",
    inputs: ["job"],
    requiresPro: true,
    parameters: {
      type: "object",
      properties: {
        jobTitle: { type: "string", description: "Role title." },
        location: { type: "string", description: "City or region." },
        industry: { type: "string", description: "Industry." },
        yearsExperience: { type: "number", description: "Years of experience." },
      },
      required: ["jobTitle"],
      additionalProperties: false,
    },
    run: runSalary,
  },
  {
    id: "video-pitch-lab",
    label: "Video Pitch Lab",
    description:
      "Write a spoken \"tell me about yourself\" pitch script from the active resume, for the user to read on camera (teleprompter). Length 30, 60 or 90 seconds; tone casual, professional or enthusiastic.",
    icon: Video,
    accentClassName: "bg-rose-100 text-rose-600",
    route: "/tools/video-pitch-lab",
    inputs: ["resume"],
    parameters: {
      type: "object",
      properties: {
        length: { type: "number", enum: [...PITCH_LENGTHS], description: "Seconds. Defaults to 60." },
        tone: { type: "string", enum: [...PITCH_TONES], description: "Defaults to professional." },
      },
      additionalProperties: false,
    },
    run: runPitchScript,
  },
  {
    id: "value-proposition",
    label: "Value Proposition",
    description:
      "Write the user's value proposition for one job (and optionally the company): a first-person pitch, an executive summary, strengths tied to results, requirement-to-evidence alignment, a call to action and a 0–100 confidence. Pass the job description the user shared. Good input for the résumé summary and the video's opening scene.",
    icon: Gauge,
    accentClassName: "bg-teal-100 text-teal-600",
    route: "/tools/value-proposition",
    inputs: ["resume", "job", "company"],
    producesScore: true,
    requiresPro: true,
    parameters: {
      type: "object",
      properties: {
        jobDescription: { type: "string", description: "The job posting text the user shared." },
        companyName: { type: "string", description: "Company name, if known." },
        companyMission: { type: "string", description: "Company mission, if the user gave it." },
        companyValues: { type: "string", description: "Company values, if the user gave them." },
      },
      required: ["jobDescription"],
      additionalProperties: false,
    },
    run: runValueProposition,
  },
  {
    id: "profile-audit",
    label: "Profile Audit",
    description:
      "Grade the user's public hired.video profile (headline, skim-ability, activity, open-to-work, photo) 0–100 and propose a new headline and summary. Use before they post, since viewers click through to the profile.",
    icon: UserCheck,
    accentClassName: "bg-cyan-100 text-cyan-600",
    route: "/tools/profile-audit",
    inputs: ["resume"],
    producesScore: true,
    requiresPro: true,
    parameters: NO_ARGS,
    run: runProfileAudit,
  },
  {
    id: "vendor-sync",
    label: "LinkedIn & Profile Sync",
    description:
      "Produce paste-ready profile blocks (headline, about, experience) from the active resume for LinkedIn or another profile site. connectorId defaults to \"linkedin\".",
    icon: Share2,
    accentClassName: "bg-sky-100 text-sky-600",
    route: "/tools/vendor-sync",
    inputs: ["resume"],
    parameters: {
      type: "object",
      properties: {
        connectorId: { type: "string", description: "Profile site id. Defaults to \"linkedin\"." },
      },
      additionalProperties: false,
    },
    run: runProfileBlocks,
  },
];
