// Single registry of every AI tool in the app. Each entry declares the
// entity types it accepts as input; context menus call getToolsForContext
// to surface the tools valid for the current entity (resume, job, video,
// template, company).

import {
  Brain,
  Briefcase,
  CalendarClock,
  Camera,
  Clapperboard,
  Copy,
  FileText,
  Film,
  Gauge,
  Heart,
  Image as ImageIcon,
  Layers,
  ListChecks,
  ListTree,
  Paintbrush,
  Pencil,
  Plus,
  Scissors,
  Shapes,
  Sparkles,
  Target,
  Trash2,
  Wand2,
  Zap,
} from "lucide-react";
import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { matchService } from "@/lib/services/match-service";
import { sentimentService } from "@/lib/services/sentiment-service";
import { resumeService } from "@/lib/services/resume-service";
import { studioService } from "@/lib/services/studio-service";
import { resumeToPlainText } from "@/lib/resume-exporters";
import { applyResumeRewrite } from "@/lib/tools/apply-rewrite";
import {
  TEMPLATE_CATALOG,
  getTemplate,
  type ContentTemplate,
} from "@/components/studio/templates/catalog";
import { seedCanvasFromTemplate } from "@/lib/studio/editor-v2/template-seeds";
import { hydrateCanvasState } from "@/lib/studio/editor-v2/hydrate-canvas-state";
import { harvestCurrentPage } from "@/lib/studio/page-harvest";
import { pageVideoSpecToCanvas } from "@/lib/studio/editor-v2/page-spec-to-canvas";
import { synthesizePendingNarration } from "@/lib/studio/page-narration";
import type { PageVideoSpec } from "@shared/page-video-spec";
import { resolveUserContent } from "@/lib/studio/editor-v2/resolve-user-content";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import {
  INSERTABLE_WIDGET_KINDS,
  type WidgetKind,
} from "@/lib/studio/editor-v2/canvas-state";
import {
  getStudioEditor,
  requireStudioEditor,
  type StudioRecordingMode,
} from "@/lib/studio/editor-v2/studio-editor-bridge";
import {
  assertWritableField,
  fieldLabel,
  requireActiveForm,
} from "@/lib/tools/active-form-bridge";
import { findSectionsContaining, setSectionHighlights } from "@/lib/tools/find-section";
import { standardizeResumeDates } from "@/lib/tools/standardize-dates";
import {
  ConsolidateHighlightsResponseSchema,
  ShortenBulletResponseSchema,
} from "@shared/tool-schemas";
import type { ResumeContent } from "@shared/resume";
import type {
  NormalizedToolRunResult,
  ToolDefinition,
  ToolEntityType,
  ToolRunContext,
} from "./types";

// ── Individual runners ──────────────────────────────────────────────────────

/** Project the merged ResumeAnalysis payload into the chat-card
 *  NormalizedToolRunResult shape. Both the Scorer and the Optimizer
 *  run() now go through this — same backend service, same projection. */
function normalizeAnalysisPayload(data: any): NormalizedToolRunResult {
  return {
    overallScore: typeof data?.overallScore === "number" ? data.overallScore : undefined,
    grade: typeof data?.grade === "string" ? data.grade : undefined,
    categoryScores: [
      ...(typeof data?.atsScore === "number" ? [{ label: "ATS Compatibility", score: data.atsScore }] : []),
      ...(typeof data?.contentScore === "number" ? [{ label: "Content Quality", score: data.contentScore }] : []),
      ...(typeof data?.keywordScore === "number" ? [{ label: "Keywords", score: data.keywordScore }] : []),
      ...(typeof data?.formatScore === "number" ? [{ label: "Format", score: data.formatScore }] : []),
      ...(typeof data?.impactScore === "number" ? [{ label: "Impact", score: data.impactScore }] : []),
    ],
    strengths: Array.isArray(data?.strengths) ? data.strengths : undefined,
    weaknesses: Array.isArray(data?.weaknesses) ? data.weaknesses : undefined,
    recommendations: Array.isArray(data?.recommendations)
      ? data.recommendations.map((r: any) => ({
          category: r.severity,
          title: r.title,
          description: r.description,
          impact: r.impact,
        }))
      : undefined,
    raw: data,
  };
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

// Shared resolver for tools whose backend needs flat resume text. Prefers
// the caller-supplied `args.resumeText` (paste-only ToolDialog runs);
// otherwise loads the bound resume by ID and flattens it. One path for
// both surfaces, so every tool that needs text behaves identically.
async function resolveResumeText(ctx: ToolRunContext): Promise<string> {
  const explicit = asString(ctx.args.resumeText);
  if (explicit) return explicit;
  const { resumeId } = ctx.bound;
  if (!resumeId) {
    throw new Error("No active resume — open a resume to run this tool.");
  }
  const resume = await resumeService.getResumeById(resumeId);
  const content = resume?.content as ResumeContent | undefined;
  if (!content) throw new Error("Resume content unavailable.");
  const text = resumeToPlainText(content).trim();
  if (!text) throw new Error("Resume is empty — add content before running this tool.");
  return text;
}

async function runScorer(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const resumeText = await resolveResumeText(ctx);
  const { data } = await apiClient.post<any>("/api/ResumeScorer/score", {
    resumeText,
    resumeId: ctx.bound.resumeId,
  });
  return normalizeAnalysisPayload(data);
}

async function runOptimizer(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const resumeText = await resolveResumeText(ctx);
  const { data } = await apiClient.post<any>("/api/ResumeOptimizer/optimize", {
    resumeText,
    resumeId: ctx.bound.resumeId,
    jobDescription: asString(ctx.args.jobDescription),
  });
  return normalizeAnalysisPayload(data);
}

async function runSentiment(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const { resumeId } = ctx.bound;
  const score = resumeId
    ? await sentimentService.analyzeResumeSentiment(resumeId)
    : await sentimentService.analyzeSentiment(asString(ctx.args.resumeText) ?? "");
  const interpretation = sentimentService.interpretSentiment(score);
  return {
    overallScore: score,
    grade: interpretation.label,
    summary: interpretation.description,
    recommendations: interpretation.recommendations.map((title) => ({ title })),
    raw: { score, interpretation },
  };
}

async function runSummarize(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const { resumeId } = ctx.bound;
  const { data } = await apiClient.post<any>(
    "/api/Resume/Summarize",
    resumeId ? { resumeId } : { resumeText: asString(ctx.args.resumeText) },
  );
  const summary = typeof data === "string" ? data : (data?.result ?? data?.summary ?? "");
  return { summary: String(summary ?? ""), raw: data };
}

async function runTailor(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const jobDescription = asString(ctx.args.jobDescription);
  if (!jobDescription) throw new Error("A job description is required to tailor a resume.");
  const data = await matchService.tailorResumeFromJobHtml({
    jobHtml: jobDescription,
    resumeId: ctx.bound.resumeId,
  } as any);
  const anyData = data as any;
  return {
    overallScore: typeof anyData.newScore === "number" ? anyData.newScore : undefined,
    recommendations: Array.isArray(anyData.recommendations)
      ? anyData.recommendations.map((r: any) => ({ title: typeof r === "string" ? r : r.title, description: r.description }))
      : undefined,
    summary: anyData.tailoredResume ? "Tailored resume generated — open the full tool to view or export it." : undefined,
    raw: data,
  };
}

async function runSkillExtractor(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const jobDescription = asString(ctx.args.jobDescription);
  const content = jobDescription ?? await resolveResumeText(ctx);
  const sourceType: "job" | "resume" = jobDescription ? "job" : "resume";
  const { data } = await apiClient.post<any>("/api/skillextractor/extract", { content, sourceType });
  const skills: Array<{ name: string; category: string }> = Array.isArray(data?.skills) ? data.skills : [];
  return {
    summary: data?.summary,
    strengths: skills.map((s) => s.name),
    raw: data,
  };
}

const INTERVIEW_QUESTION_TYPES = [
  "technical",
  "behavioral",
  "system-design",
  "product",
  "general",
] as const;

async function runInterviewQuestions(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  // The endpoint requires a job description (or a detailed target-role brief)
  // ≥20 chars. "From my resume" alone has no JD, so the coach must supply the
  // target — its description tells the model that.
  const jobDescription = asString(ctx.args.jobDescription);
  if (!jobDescription || jobDescription.trim().length < 20) {
    throw new Error(
      "A target job description or detailed target-role brief (20+ characters) is required to generate interview questions.",
    );
  }
  const rawType = asString(ctx.args.type);
  const type = (INTERVIEW_QUESTION_TYPES as readonly string[]).includes(rawType ?? "")
    ? rawType
    : "behavioral";
  const count =
    typeof ctx.args.count === "number" && ctx.args.count >= 3 && ctx.args.count <= 10
      ? Math.round(ctx.args.count)
      : 5;
  // Best-effort: personalise against the active resume when one is bound.
  let resumeText: string | undefined;
  try {
    resumeText = (await resolveResumeText(ctx)).slice(0, 5000);
  } catch {
    resumeText = undefined;
  }
  const { data } = await apiClient.post<any>("/api/interview/questions", {
    jobDescription: jobDescription.slice(0, 5000),
    resumeText,
    type,
    count,
  });
  const questions: Array<{ question: string; category: string; timeLimit?: number }> = Array.isArray(
    data?.questions,
  )
    ? data.questions
    : [];
  return {
    summary: `Generated ${questions.length} ${type} interview question${questions.length === 1 ? "" : "s"}.`,
    recommendations: questions.map((q) => ({
      title: q.question,
      description: [q.category, q.timeLimit ? `${q.timeLimit}s` : null].filter(Boolean).join(" · "),
    })),
    raw: data,
  };
}

async function runJobMatch(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const jobDescription = asString(ctx.args.jobDescription);
  if (!jobDescription) throw new Error("A job description is required for job matching.");
  const data = await matchService.matchJobWithResume({
    jobContent: jobDescription,
    resumeId: ctx.bound.resumeId,
  });
  const anyData = data as any;
  return {
    overallScore: typeof anyData.score === "number" ? anyData.score : undefined,
    strengths: Array.isArray(anyData.matchedKeywords) ? anyData.matchedKeywords : undefined,
    weaknesses: Array.isArray(anyData.missingKeywords) ? anyData.missingKeywords : undefined,
    recommendations: Array.isArray(anyData.recommendations)
      ? anyData.recommendations.map((r: any) => ({ title: typeof r === "string" ? r : r.title, description: r.description }))
      : undefined,
    raw: data,
  };
}

// ── Studio: generate a video from a template using user content ────────────
//
// The AI CHRO's entry point into the V2 Studio. Given a templateId, the
// runner pulls the user's resume + profile via `resolveUserContent`,
// substitutes the template's declared slot placeholders with that
// content, and stages the hydrated `CanvasState` as a pending mutation.
// commitMutation persists it as an `nle`-kind StudioProject draft and
// the ToolCallCard surfaces an Open link to the V2 editor.
//
// V1 is dead per the V2-only editor preference — we never write `script`
// for these drafts.

const TEMPLATE_ID_VALUES = TEMPLATE_CATALOG.map((t) => t.id) as ContentTemplate[];

async function runGenerateVideoFromTemplate(
  ctx: ToolRunContext,
): Promise<NormalizedToolRunResult> {
  const raw = ctx.args.templateId;
  const templateId = typeof raw === "string" && TEMPLATE_ID_VALUES.includes(raw as ContentTemplate)
    ? (raw as ContentTemplate)
    : undefined;
  if (!templateId) {
    throw new Error(
      `generate_video_from_template requires \`templateId\` — one of: ${TEMPLATE_ID_VALUES.join(", ")}.`,
    );
  }
  const template = getTemplate(templateId);
  const userContent = await resolveUserContent({
    preferredResumeId: ctx.bound.resumeId,
  });

  const seeded = seedCanvasFromTemplate(templateId);
  const hydrated = hydrateCanvasState(seeded, templateId, userContent);

  const name = asString(ctx.args.name) ?? template.defaultName;
  const prompt = asString(ctx.args.prompt);

  // Build a human-readable preview so the user sees what will land on
  // the canvas before they click Apply.
  const previewLines: string[] = [`Template: ${template.label}`];
  const filledFields: string[] = [];
  if (userContent.profile?.name) filledFields.push(`name=${userContent.profile.name}`);
  if (userContent.profile?.headline) filledFields.push(`headline=${userContent.profile.headline}`);
  if (userContent.resume?.work?.length) filledFields.push(`work=${userContent.resume.work.length} role${userContent.resume.work.length === 1 ? "" : "s"}`);
  if (userContent.resume?.skills?.length) filledFields.push(`skills=${userContent.resume.skills.length}`);
  if (filledFields.length > 0) {
    previewLines.push(`Filled from your profile + resume: ${filledFields.join(", ")}`);
  } else {
    previewLines.push("No resume / profile content found — opening with placeholder text.");
  }
  if (prompt) previewLines.push(`Prompt: ${prompt}`);

  return {
    summary: `Create a new "${template.label}" video draft, pre-filled with your content.`,
    previewText: previewLines.join("\n"),
    mutation: { status: "pending", location: "studio" },
    raw: {
      kind: "generate_video_from_template",
      templateId,
      name,
      prompt,
      purpose: template.purpose,
      hydrated,
    },
  };
}

// ── Studio: generate a video from the CURRENT PAGE (SuperAdmin) ──────────────
// #1860. The Brain harvests the live marketing page (DOM headings, body
// copy, content images, CTAs, the route's PAGE_SEO positioning), posts it
// to the SuperAdmin-gated scaffolder, and stages the returned
// `PageVideoSpec` as a pending mutation. commitMutation hydrates the spec
// into a CanvasState and persists it as an `nle` video draft, then the
// ToolCallCard surfaces an Open link to the Studio editor for review.
async function runGenerateVideoFromPage(
  ctx: ToolRunContext,
): Promise<NormalizedToolRunResult> {
  const page = harvestCurrentPage();
  if (!page) {
    throw new Error("Can't read the current page — open this on a rendered page and try again.");
  }
  const { data } = await studioService.generatePageVideo(page);
  const spec = data.spec;
  const name = asString(ctx.args.name) ?? spec.title ?? `Video — ${page.title || page.pathname}`;

  const previewLines: string[] = [
    `Source: ${page.pathname}`,
    `Scenes: ${spec.scenes.length} (${spec.scenes.map((s) => s.kind).join(" → ")})`,
    `Format: ${spec.aspect}`,
  ];
  const firstHook = spec.scenes.find((s) => s.kind === "hook");
  if (firstHook) previewLines.push(`Hook: "${firstHook.headline}"`);

  return {
    summary: `Drafted a ${spec.scenes.length}-scene video from ${page.pathname}. Apply to open it in Studio for review.`,
    previewText: previewLines.join("\n"),
    mutation: { status: "pending", location: "studio" },
    raw: {
      kind: "generate_video_from_page",
      name,
      sourcePath: page.pathname,
      spec,
    },
  };
}

// ── Mutation runners (AI coach edits resume / profile) ──────────────────────
//
// These return `mutation: { status: "pending", ... }` and DO NOT persist on
// their own. The chat panel's ToolCallCard inspects the user's
// `aiAutoApplyChanges` setting and either calls `commitMutation` (which
// performs the persist) or waits for the user to click Apply. Read-only
// tools keep their original semantics — they always run to completion.

async function runApplyResumeRewrite(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const original = asString(ctx.args.original);
  const improved = asString(ctx.args.improved);
  if (!original || !improved) {
    throw new Error("apply_resume_rewrite requires `original` and `improved` strings.");
  }
  const { resumeId } = ctx.bound;
  if (!resumeId) {
    throw new Error("No active resume — open a resume to apply edits.");
  }
  return {
    summary: `Rewrite proposed: replace one bullet/summary on the active resume.`,
    previewText: `Before:\n${original}\n\nAfter:\n${improved}`,
    mutation: { status: "pending" },
    raw: { kind: "apply_resume_rewrite", resumeId, original, improved },
  };
}

async function runUpdateResumeSummary(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const summary = asString(ctx.args.summary);
  if (!summary) throw new Error("update_resume_summary requires `summary`.");
  const { resumeId } = ctx.bound;
  if (!resumeId) throw new Error("No active resume — open a resume to apply edits.");
  return {
    summary: "New resume summary proposed.",
    previewText: summary,
    mutation: { status: "pending", location: "basics.summary" },
    raw: { kind: "update_resume_summary", resumeId, summary },
  };
}

async function runAddResumeSkill(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const name = asString(ctx.args.name);
  if (!name) throw new Error("add_resume_skill requires `name`.");
  const { resumeId } = ctx.bound;
  if (!resumeId) throw new Error("No active resume — open a resume to add skills.");
  const level = asString(ctx.args.level) ?? "";
  return {
    summary: `Add skill: ${name}${level ? ` (${level})` : ""}`,
    previewText: name,
    mutation: { status: "pending", location: "skills" },
    raw: { kind: "add_resume_skill", resumeId, name, level },
  };
}

async function runConsolidateSectionHighlights(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const matchHighlight = asString(ctx.args.matchHighlight);
  if (!matchHighlight) {
    throw new Error("consolidate_section_highlights requires `matchHighlight`.");
  }
  const { resumeId } = ctx.bound;
  if (!resumeId) {
    throw new Error("No active resume — open a resume to consolidate bullets.");
  }

  const resume = await resumeService.getResumeById(resumeId);
  const content = resume?.content as ResumeContent | undefined;
  if (!content) throw new Error("Resume content unavailable.");

  const hits = findSectionsContaining(content, matchHighlight);
  if (hits.length === 0) {
    throw new Error("Couldn't find that bullet on the resume — was it edited recently?");
  }
  const target = hits[0];

  const { data } = await apiClient.post(
    "/api/resumeoptimizer/consolidate-highlights",
    { highlights: target.highlights, context: target.context },
    ConsolidateHighlightsResponseSchema,
  );
  const consolidated = data.items.map((i) => i.text);
  if (consolidated.length === 0) {
    throw new Error("AI couldn't consolidate these — try again in a moment.");
  }

  const before = target.highlights.map((h, i) => `${i + 1}. ${h}`).join("\n");
  const after = consolidated.map((h, i) => `${i + 1}. ${h}`).join("\n");
  const reduction = target.highlights.length - consolidated.length;

  return {
    summary:
      reduction > 0
        ? `Consolidated ${target.highlights.length} → ${consolidated.length} bullets on ${target.label}.`
        : `Tightened ${consolidated.length} bullets on ${target.label}.`,
    previewText: `${target.label}\n\nBefore:\n${before}\n\nAfter:\n${after}`,
    mutation: { status: "pending", location: `${target.kind}[${target.index}].highlights` },
    raw: {
      kind: "consolidate_section_highlights",
      resumeId,
      sectionKind: target.kind,
      sectionIndex: target.index,
      consolidated,
    },
  };
}

async function runStandardizeResumeDates(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const { resumeId } = ctx.bound;
  if (!resumeId) {
    throw new Error("No active resume — open a resume to standardize dates.");
  }
  const resume = await resumeService.getResumeById(resumeId);
  const content = resume?.content as ResumeContent | undefined;
  if (!content) throw new Error("Resume content unavailable.");

  const { next, report } = standardizeResumeDates(content);
  if (report.changedCount === 0) {
    return {
      summary: "All dates already use the standard format. Nothing to apply.",
      previewText:
        report.unparseable.length > 0
          ? `Couldn't parse:\n${report.unparseable.map((u) => `  • ${u.location}: "${u.value}"`).join("\n")}`
          : undefined,
      raw: { kind: "noop" },
    };
  }

  const preview = report.changes
    .map((c) => `  • ${c.location}: "${c.from}" → "${c.to}"`)
    .join("\n");
  const more =
    report.changedCount > report.changes.length
      ? `\n  …and ${report.changedCount - report.changes.length} more`
      : "";
  const unparseable =
    report.unparseable.length > 0
      ? `\n\nLeft alone (couldn't parse):\n${report.unparseable.map((u) => `  • ${u.location}: "${u.value}"`).join("\n")}`
      : "";

  return {
    summary: `Standardize ${report.changedCount} date${report.changedCount === 1 ? "" : "s"} on the resume.`,
    previewText: `Will change:\n${preview}${more}${unparseable}`,
    mutation: { status: "pending", location: "dates" },
    raw: {
      kind: "standardize_resume_dates",
      resumeId,
      next,
    },
  };
}

// Generate an image via the shared `studioService.generateImage` port
// — same Cloudflare SDXL-lightning / SD-v1.5 img2img path the studio
// surfaces use (per the cross-studio first-class image-AI rollout).
// The route writes the PNG to R2 under `uploads/{userId}/ai-images/`,
// which IS the user's media library (listed by `GET /api/upload/images`),
// so the result is automatically available in the MediaPicker's
// Library tab afterwards — no separate "save to library" step.
async function runGenerateImage(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const prompt = asString(ctx.args.prompt);
  if (!prompt) {
    throw new Error("generate_image requires `prompt`.");
  }
  const sourceImageUrl = asString(ctx.args.sourceImageUrl);
  const { data } = await studioService.generateImage(prompt, {
    sourceImageUrl,
  });
  return buildGenerateImageResult({
    imageUrl: data.imageUrl,
    mode: data.mode,
    prompt,
  });
}

/** Build the canonical `NormalizedToolRunResult` for a successful image
 *  generation. Exported so the CHRO Brain's quick-action chip can
 *  synthesize the same tool-run card the model-invoked path produces,
 *  without spending a round-trip + tokens on a chat reply. Both call
 *  sites end up with byte-identical cards (per the DRY rule). */
export function buildGenerateImageResult(args: {
  imageUrl: string;
  mode?: "img2img" | "text2img";
  prompt: string;
}): NormalizedToolRunResult {
  const { imageUrl, mode, prompt } = args;
  return {
    summary: `Generated image${mode === "img2img" ? " (rewrote source)" : ""} and saved to your library.`,
    mediaPreviewUrl: imageUrl,
    extras: [
      { label: "Mode", value: mode ?? "text2img" },
      { label: "Prompt", value: prompt },
    ],
    raw: { kind: "generate_image", imageUrl, mode, prompt },
  };
}

async function runShortenBullet(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const original = asString(ctx.args.original);
  if (!original) {
    throw new Error("shorten_bullet requires `original` (the bullet text to shorten).");
  }
  const { resumeId } = ctx.bound;
  if (!resumeId) {
    throw new Error("No active resume — open a resume to shorten bullets.");
  }
  const maxChars = typeof ctx.args.maxChars === "number" ? ctx.args.maxChars : undefined;

  const { data } = await apiClient.post<{ improved: string }>(
    "/api/resumeoptimizer/shorten-bullet",
    { original, maxChars },
    ShortenBulletResponseSchema,
  );
  const improved = data.improved;
  if (!improved || improved.trim().length === 0) {
    throw new Error("Shorten failed — got an empty rewrite.");
  }

  return {
    summary: `Shorten one bullet (${original.length} → ${improved.length} chars).`,
    previewText: `Before:\n${original}\n\nAfter:\n${improved}`,
    mutation: { status: "pending" },
    // Reuse the apply_resume_rewrite commit path — one matcher + one
    // persistence pipeline regardless of which tool produced the rewrite.
    raw: { kind: "apply_resume_rewrite", resumeId, original, improved },
  };
}

// ── Job-draft mutation runner (writes through active-form-bridge) ──────────
//
// Unlike resume mutations — which persist via the API — job-draft writes
// land in React-Hook-Form state on the open page (e.g. JobCreatePage).
// The page registers its form via `useActiveFormBridge`; the runner here
// just captures the args and the commit step calls `setValue` per field.

type JobDraftFields = {
  title?: string;
  description?: string;
  company?: string;
  location?: string;
  responsibilities?: string;
  requirements?: string;
  employmentType?: string[];
  seniority?: string[];
  workSetting?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
};

/** Form id that JobCreatePage publishes via `useActiveFormBridge`. The
 *  string is referenced both here and at the page; keep them in lockstep
 *  by importing this constant. */
export const JOB_CREATE_FORM_ID = "jobs.create";

function pickJobDraftFields(args: Record<string, unknown>): JobDraftFields {
  const out: JobDraftFields = {};
  if (typeof args.title === "string") out.title = args.title;
  if (typeof args.description === "string") out.description = args.description;
  if (typeof args.company === "string") out.company = args.company;
  if (typeof args.location === "string") out.location = args.location;
  if (typeof args.responsibilities === "string") out.responsibilities = args.responsibilities;
  if (typeof args.requirements === "string") out.requirements = args.requirements;
  if (Array.isArray(args.employmentType)) {
    out.employmentType = args.employmentType.filter((v): v is string => typeof v === "string");
  }
  if (Array.isArray(args.seniority)) {
    out.seniority = args.seniority.filter((v): v is string => typeof v === "string");
  }
  if (typeof args.workSetting === "string") out.workSetting = args.workSetting;
  if (typeof args.salaryMin === "number") out.salaryMin = args.salaryMin;
  if (typeof args.salaryMax === "number") out.salaryMax = args.salaryMax;
  if (typeof args.currency === "string") out.currency = args.currency;
  return out;
}

const JOB_FIELD_LABELS: Record<keyof JobDraftFields, string> = {
  title: "Title",
  description: "Description",
  company: "Company",
  location: "Location",
  responsibilities: "Responsibilities",
  requirements: "Requirements",
  employmentType: "Employment type",
  seniority: "Seniority",
  workSetting: "Work setting",
  salaryMin: "Salary min",
  salaryMax: "Salary max",
  currency: "Currency",
};

function formatJobDraftPreview(fields: JobDraftFields): string {
  const lines: string[] = [];
  for (const key of Object.keys(fields) as (keyof JobDraftFields)[]) {
    const value = fields[key];
    if (value === undefined) continue;
    const label = JOB_FIELD_LABELS[key];
    if (Array.isArray(value)) {
      lines.push(`${label}: ${value.join(", ")}`);
    } else if (typeof value === "string" && value.length > 200) {
      lines.push(`${label}:\n${value}`);
    } else {
      lines.push(`${label}: ${String(value)}`);
    }
  }
  return lines.join("\n\n");
}

async function runApplyJobDraft(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const fields = pickJobDraftFields(ctx.args);
  const provided = Object.keys(fields) as (keyof JobDraftFields)[];
  if (provided.length === 0) {
    throw new Error("apply_job_draft requires at least one field to set.");
  }

  // Validate every requested field against the page's writableFields
  // whitelist NOW (during run), so the model gets immediate feedback if
  // it picked an unknown field — instead of waiting for the user to hit
  // Apply.
  const handle = requireActiveForm(JOB_CREATE_FORM_ID);
  for (const key of provided) {
    assertWritableField(handle, key);
  }

  const summary =
    provided.length === 1
      ? `Update ${fieldLabel(handle, provided[0])} on the job posting.`
      : `Update ${provided.length} fields on the job posting.`;

  return {
    summary,
    previewText: formatJobDraftPreview(fields),
    mutation: { status: "pending", location: provided.join(", ") },
    raw: { kind: "apply_job_draft", formId: JOB_CREATE_FORM_ID, fields },
  };
}

/**
 * Persist a `mutation: { status: "pending" }` result. Called by the
 * ToolCallCard either when the user clicks Apply or when auto-apply is on.
 * Returns an updated NormalizedToolRunResult with `mutation.status` set
 * to `applied` or `failed`.
 */
export async function commitMutation(
  result: NormalizedToolRunResult,
  queryClient?: QueryClient,
): Promise<NormalizedToolRunResult> {
  const raw = (result.raw ?? {}) as { kind?: string; resumeId?: string } & Record<string, unknown>;

  try {
    if (raw.kind === "apply_resume_rewrite") {
      const original = String(raw.original ?? "");
      const improved = String(raw.improved ?? "");
      const out = await applyResumeRewrite(raw.resumeId, original, improved, queryClient);
      if (out.ok) {
        return { ...result, mutation: { status: "applied", location: out.location } };
      }
      return { ...result, mutation: { status: "failed", location: result.mutation?.location }, summary: out.reason === "no_match" ? "Couldn't find that bullet on the resume — was it edited recently?" : (out.message || "Apply failed") };
    }

    if (raw.kind === "update_resume_summary") {
      if (!raw.resumeId) throw new Error("Missing resumeId");
      const resume = await resumeService.getResumeById(raw.resumeId);
      const content = (resume?.content ?? {}) as ResumeContent;
      const next = JSON.parse(JSON.stringify(content)) as ResumeContent;
      next.basics = { ...(next.basics ?? { name: "", label: "", image: "", email: "", phone: "", url: "", summary: "" }), summary: String(raw.summary ?? "") };
      await resumeService.updateResumeData(raw.resumeId, { data: next });
      await queryClient?.invalidateQueries({ queryKey: ["resume", raw.resumeId] });
      await queryClient?.invalidateQueries({ queryKey: ["resumes"] });
      return { ...result, mutation: { status: "applied", location: "basics.summary" } };
    }

    if (raw.kind === "add_resume_skill") {
      if (!raw.resumeId) throw new Error("Missing resumeId");
      const resume = await resumeService.getResumeById(raw.resumeId);
      const content = (resume?.content ?? {}) as ResumeContent;
      const next = JSON.parse(JSON.stringify(content)) as ResumeContent;
      const name = String(raw.name ?? "");
      const level = String(raw.level ?? "");
      const skills = Array.isArray(next.skills) ? next.skills : [];
      // Skip duplicates (case-insensitive) so the LLM can re-call without harm.
      if (!skills.some((s) => s.name?.toLowerCase() === name.toLowerCase())) {
        skills.push({ name, level, keywords: [] });
        next.skills = skills;
        await resumeService.updateResumeData(raw.resumeId, { data: next });
        await queryClient?.invalidateQueries({ queryKey: ["resume", raw.resumeId] });
        await queryClient?.invalidateQueries({ queryKey: ["resumes"] });
      }
      return { ...result, mutation: { status: "applied", location: "skills" } };
    }

    if (raw.kind === "consolidate_section_highlights") {
      if (!raw.resumeId) throw new Error("Missing resumeId");
      const resume = await resumeService.getResumeById(raw.resumeId);
      const content = (resume?.content ?? {}) as ResumeContent;
      const next = JSON.parse(JSON.stringify(content)) as ResumeContent;
      const sectionKind = raw.sectionKind as "work" | "volunteer" | "projects";
      const sectionIndex = raw.sectionIndex as number;
      const consolidated = (raw.consolidated as string[]) ?? [];
      setSectionHighlights(next, { kind: sectionKind, index: sectionIndex }, consolidated);
      await resumeService.updateResumeData(raw.resumeId, { data: next });
      await queryClient?.invalidateQueries({ queryKey: ["resume", raw.resumeId] });
      await queryClient?.invalidateQueries({ queryKey: ["resumes"] });
      return {
        ...result,
        mutation: { status: "applied", location: `${sectionKind}[${sectionIndex}].highlights` },
      };
    }

    if (raw.kind === "standardize_resume_dates") {
      if (!raw.resumeId) throw new Error("Missing resumeId");
      const next = raw.next as ResumeContent;
      await resumeService.updateResumeData(raw.resumeId, { data: next });
      await queryClient?.invalidateQueries({ queryKey: ["resume", raw.resumeId] });
      await queryClient?.invalidateQueries({ queryKey: ["resumes"] });
      return { ...result, mutation: { status: "applied", location: "dates" } };
    }

    if (raw.kind === "generate_video_from_template") {
      const name = String(raw.name ?? "");
      const hydrated = raw.hydrated as Parameters<typeof canvasStateToTimeline>[0];
      const purpose = raw.purpose as
        | "personal_brand"
        | "resume"
        | "job_ad"
        | "company_promo"
        | "product_launch"
        | "basic"
        | undefined;
      const prompt = typeof raw.prompt === "string" ? (raw.prompt as string) : undefined;
      const created = await studioService.saveDraft({
        name,
        kind: "nle",
        timelineSpec: canvasStateToTimeline(hydrated),
        purpose,
        ...(prompt ? { prompt } : {}),
      });
      const projectId = created.data?.id;
      if (!projectId) throw new Error("Studio draft created but no id returned");
      await queryClient?.invalidateQueries({ queryKey: ["studio", "projects"] });
      return {
        ...result,
        summary: `Created "${name}" — open it to edit, record, or generate the voiceover.`,
        mutation: { status: "applied", location: `studio:${projectId}` },
        redirectUrl: `/studio/${encodeURIComponent(projectId)}`,
      };
    }

    if (raw.kind === "generate_video_from_page") {
      const name = String(raw.name ?? "Page video");
      const spec = raw.spec as PageVideoSpec;
      // Synthesise the per-scene narration into audio on the A2 voiceover
      // track BEFORE emitting the timeline, so the draft opens already
      // narrated (best-effort — silent fallback when no WebGPU engine).
      const { canvas: narrated } = await synthesizePendingNarration(
        pageVideoSpecToCanvas(spec),
      );
      const created = await studioService.saveDraft({
        name,
        kind: "nle",
        mediaKind: "video",
        timelineSpec: canvasStateToTimeline(narrated),
      });
      const projectId = created.data?.id;
      if (!projectId) throw new Error("Studio draft created but no id returned");
      await queryClient?.invalidateQueries({ queryKey: ["studio", "projects"] });
      // Carry the source page through to the editor so the Embed dialog
      // pre-fills "Publish to page" with the page this video was built
      // from (no draft column needed — survives the redirect; #1862).
      const sourcePath = typeof raw.sourcePath === "string" ? raw.sourcePath : "";
      const embedQuery = sourcePath ? `?embedPath=${encodeURIComponent(sourcePath)}` : "";
      return {
        ...result,
        summary: `Created "${name}" — review it in Studio, then publish & embed.`,
        mutation: { status: "applied", location: `studio:${projectId}` },
        redirectUrl: `/studio/${encodeURIComponent(projectId)}${embedQuery}`,
      };
    }

    if (raw.kind === "apply_job_draft") {
      const formId = String(raw.formId ?? "");
      const fields = (raw.fields ?? {}) as JobDraftFields;
      const handle = requireActiveForm(formId);
      const provided = Object.keys(fields) as (keyof JobDraftFields)[];
      for (const key of provided) {
        assertWritableField(handle, key);
        handle.setValue(key, fields[key]);
      }
      return { ...result, mutation: { status: "applied", location: provided.join(", ") } };
    }

    throw new Error(`Unknown mutation kind: ${raw.kind}`);
  } catch (err: any) {
    return {
      ...result,
      mutation: { status: "failed", location: result.mutation?.location },
      summary: err?.message || "Apply failed",
    };
  }
}

// ── Studio editor tools (drive the OPEN editor via the bridge) ──────────────
//
// These mutate the Studio editor that is currently open in the tab — the
// headline ask: users keep asking the in-studio AI CHRO to "screen
// record". Each runner calls into the module-level studio-editor bridge
// (registered by StudioEditorV2 on mount), which wraps the SAME callbacks
// the on-screen buttons fire (DRY). They self-gate: `getCoachToolSpecs`
// only exposes them to the model when an editor is mounted, and
// `requireStudioEditor()` throws a friendly error otherwise.
//
// Client-only: the bridge lives in the browser, so the server-side
// /api/mcp endpoint cannot run these — only the in-app AI CHRO can.

function asTrimmed(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

const RECORDING_MODES: readonly StudioRecordingMode[] = [
  "screen",
  "webcam",
  "screen-pip",
];

async function runStudioStartRecording(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const raw = ctx.args.mode;
  const mode: StudioRecordingMode = RECORDING_MODES.includes(raw as StudioRecordingMode)
    ? (raw as StudioRecordingMode)
    : "screen";
  // The browser requires a user gesture for screen/camera capture, so we
  // can't silently start recording from a tool call — we surface the
  // armed recorder and let the user hit Record.
  requireStudioEditor().openRecorder(mode, { asScene: true });
  const label =
    mode === "webcam" ? "webcam" : mode === "screen-pip" ? "screen + webcam" : "screen";
  return {
    summary: `Opened the ${label} recorder. Click Record to start — your recording becomes its own scene, so you can stitch slide → recording → slide on save.`,
    raw: { kind: "studio_start_recording", mode },
  };
}

async function runStudioInsertWidget(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const editor = requireStudioEditor();
  const kind = ctx.args.kind as WidgetKind;
  const allowed = editor.insertableWidgetKinds();
  if (!allowed.includes(kind)) {
    throw new Error(
      `Can't insert "${String(kind)}" into this ${editor.mediaKind} project. Insertable kinds: ${allowed.join(", ")}.`,
    );
  }
  editor.insertWidget(kind);
  return {
    summary: `Added a ${kind} widget to the active scene.`,
    raw: { kind: "studio_insert_widget", widgetKind: kind },
  };
}

async function runStudioAddScene(): Promise<NormalizedToolRunResult> {
  const sceneId = requireStudioEditor().addScene();
  return {
    summary: "Added a new blank scene.",
    raw: { kind: "studio_add_scene", sceneId },
  };
}

async function runStudioDuplicateScene(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const sceneId = asTrimmed(ctx.args.sceneId);
  if (!sceneId) throw new Error("studio_duplicate_scene requires `sceneId` (call studio_list_scenes to get ids).");
  requireStudioEditor().duplicateScene(sceneId);
  return { summary: "Duplicated the scene.", raw: { kind: "studio_duplicate_scene", sceneId } };
}

async function runStudioDeleteScene(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const sceneId = asTrimmed(ctx.args.sceneId);
  if (!sceneId) throw new Error("studio_delete_scene requires `sceneId` (call studio_list_scenes to get ids).");
  requireStudioEditor().deleteScene(sceneId);
  return { summary: "Deleted the scene.", raw: { kind: "studio_delete_scene", sceneId } };
}

async function runStudioReorderScenes(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const orderedIds = Array.isArray(ctx.args.orderedIds)
    ? ctx.args.orderedIds.filter((v): v is string => typeof v === "string")
    : [];
  if (orderedIds.length === 0) {
    throw new Error("studio_reorder_scenes requires `orderedIds` — the scene ids in the new order.");
  }
  requireStudioEditor().reorderScenes(orderedIds);
  return { summary: "Reordered the scenes.", raw: { kind: "studio_reorder_scenes", orderedIds } };
}

async function runStudioActivateScene(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const sceneId = asTrimmed(ctx.args.sceneId);
  if (!sceneId) throw new Error("studio_activate_scene requires `sceneId`.");
  requireStudioEditor().setActiveScene(sceneId);
  return { summary: "Switched to the scene.", raw: { kind: "studio_activate_scene", sceneId } };
}

async function runStudioSetSceneBackground(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const color = asTrimmed(ctx.args.color);
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error("studio_set_scene_background requires `color` as a 6-digit hex (e.g. \"#0f172a\").");
  }
  const editor = requireStudioEditor();
  const sceneId = asTrimmed(ctx.args.sceneId) ?? editor.getActiveSceneId();
  editor.setSceneBackground(sceneId, color);
  return { summary: `Set the scene background to ${color}.`, raw: { kind: "studio_set_scene_background", sceneId, color } };
}

async function runStudioCaptureScreenshot(): Promise<NormalizedToolRunResult> {
  await requireStudioEditor().captureScreenshot();
  return {
    summary: "Opened the screenshot picker — pick a window/tab/screen to capture it onto the scene.",
    raw: { kind: "studio_capture_screenshot" },
  };
}

async function runStudioAddImage(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const url = asTrimmed(ctx.args.url);
  if (!url) throw new Error("studio_add_image requires `url` (a public image URL — e.g. one returned by generate_image).");
  requireStudioEditor().addImageWidget(url);
  return { summary: "Added the image to the active scene.", raw: { kind: "studio_add_image", url } };
}

async function runStudioAddVideo(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const url = asTrimmed(ctx.args.url);
  if (!url) throw new Error("studio_add_video requires `url` (a public video URL).");
  const durationSeconds = typeof ctx.args.durationSeconds === "number" ? ctx.args.durationSeconds : 0;
  requireStudioEditor().addVideoWidget(url, durationSeconds);
  return { summary: "Added the video to the active scene.", raw: { kind: "studio_add_video", url, durationSeconds } };
}

async function runStudioListScenes(): Promise<NormalizedToolRunResult> {
  const scenes = requireStudioEditor().listScenes();
  const lines = scenes.map(
    (s, i) =>
      `${i + 1}. ${s.label} — ${s.durationSeconds}s, ${s.widgetCount} widget${s.widgetCount === 1 ? "" : "s"}${s.active ? " (active)" : ""} [id: ${s.id}]`,
  );
  return {
    summary: `${scenes.length} scene${scenes.length === 1 ? "" : "s"} in this project.`,
    previewText: lines.join("\n"),
    raw: { kind: "studio_list_scenes", scenes },
  };
}

// ── Registry ────────────────────────────────────────────────────────────────

// JSON-schema fragment shared by every tool that operates on the active
// resume. The chat panel injects the bound resumeId into ToolRunContext,
// so the LLM never has to (and never should) pass it.
const NO_ARGS = { type: "object", properties: {}, additionalProperties: false } as const;

export const toolRegistry: ToolDefinition[] = [
  {
    id: "ai-resume-scorer",
    label: "AI Resume Scorer",
    description: "Score the user's active resume across ATS, content, keywords, format, and impact. Returns an overall 0–100 score, category breakdowns, strengths, weaknesses, and recommendations.",
    icon: Brain,
    accentClassName: "bg-brand-purple/10 text-brand-purple",
    route: "/tools/ai-resume-scorer",
    inputs: ["resume"],
    producesScore: true,
    parameters: NO_ARGS,
    run: runScorer,
  },
  {
    id: "resume-optimizer",
    label: "Resume Optimizer",
    description: "Optimize the active resume for ATS, keywords, format, and content. Optionally against a target job description if the user has supplied one. Returns a 0–100 score plus prioritized rewrite suggestions.",
    icon: Zap,
    accentClassName: "bg-brand-blue/10 text-brand-blue",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    producesScore: true,
    requiresPro: true,
    parameters: NO_ARGS,
    run: runOptimizer,
  },
  {
    id: "sentiment-analysis",
    label: "Sentiment Analysis",
    description: "Score the tone of the active resume on a 0–100 scale (positive, neutral, negative). Useful when the user is worried their resume reads as flat or negative.",
    icon: Heart,
    accentClassName: "bg-pink-100 text-pink-600",
    route: "/tools/sentiment-analysis",
    inputs: ["resume"],
    producesScore: true,
    parameters: NO_ARGS,
    run: runSentiment,
  },
  {
    id: "summarize-resume",
    label: "Summarize Resume",
    description: "Generate a recruiter-ready summary paragraph of the active resume. Use this before suggesting a new headline/summary so you have a baseline.",
    icon: FileText,
    accentClassName: "bg-brand-green/10 text-brand-green",
    route: "/tools/summarize-resume",
    inputs: ["resume"],
    parameters: NO_ARGS,
    run: runSummarize,
  },
  {
    id: "resume-tailor",
    label: "Tailor to Job",
    description: "Rewrite the active resume to better match a specific job description that the user has shared. Returns the tailored content and the new ATS-style score.",
    icon: Sparkles,
    accentClassName: "bg-amber-100 text-amber-600",
    route: "/tools/resume-tailor",
    inputs: ["resume", "job"],
    producesScore: true,
    requiresPro: true,
    parameters: {
      type: "object",
      properties: {
        jobDescription: {
          type: "string",
          description: "The full text of the job posting to tailor the resume against. Pass exactly what the user shared.",
        },
      },
      required: ["jobDescription"],
      additionalProperties: false,
    },
    run: runTailor,
  },
  {
    id: "job-resume-match",
    label: "Job Match",
    description: "Score how well the active resume matches a specific job posting (0–100), with matched and missing keywords. Use this when the user wants to know if it's worth applying.",
    icon: Target,
    accentClassName: "bg-indigo-100 text-indigo-600",
    route: "/tools/job-resume-match",
    inputs: ["resume", "job"],
    producesScore: true,
    requiresPro: true,
    parameters: {
      type: "object",
      properties: {
        jobDescription: {
          type: "string",
          description: "The full text of the job posting to match against.",
        },
      },
      required: ["jobDescription"],
      additionalProperties: false,
    },
    run: runJobMatch,
  },
  {
    id: "interview-questions",
    label: "Interview Questions",
    description:
      "Generate calibrated interview questions for a target role from a job description (or a detailed target-role brief). Personalises against the user's active resume when one is open. Use when the user asks to practise or prep interview questions. Requires a jobDescription — if the user only names a role, write a short JD for it before calling.",
    icon: ListChecks,
    accentClassName: "bg-sky-100 text-sky-600",
    route: "/tools/interview-questions",
    inputs: ["resume", "job"],
    parameters: {
      type: "object",
      properties: {
        jobDescription: {
          type: "string",
          description:
            "The target job description (or a detailed target-role brief, 20+ characters) to generate questions for.",
        },
        type: {
          type: "string",
          enum: ["technical", "behavioral", "system-design", "product", "general"],
          description: "Interview type. Defaults to behavioral.",
        },
        count: {
          type: "number",
          description: "How many questions to generate (3–10). Defaults to 5.",
        },
      },
      required: ["jobDescription"],
      additionalProperties: false,
    },
    run: runInterviewQuestions,
  },
  {
    id: "skill-extractor",
    label: "Skill Extractor",
    description: "Pull every distinct skill (grouped, deduplicated) out of either the active resume or a job description the user shared. Pass jobDescription only when the user wants skills from a job, not from their resume.",
    icon: ListChecks,
    accentClassName: "bg-brand-purple/10 text-brand-purple",
    route: "/tools/skill-extractor",
    inputs: ["resume", "job"],
    parameters: {
      type: "object",
      properties: {
        jobDescription: {
          type: "string",
          description: "Optional. If present, extract skills from this job description instead of the resume.",
        },
      },
      additionalProperties: false,
    },
    run: runSkillExtractor,
  },
  {
    id: "value-proposition",
    label: "Value Proposition",
    description: "Craft a tailored value proposition for a specific company and role. Multi-step — open the full tool page rather than calling from the coach.",
    icon: Gauge,
    accentClassName: "bg-teal-100 text-teal-600",
    route: "/tools/value-proposition",
    inputs: ["resume", "job", "company"],
    producesScore: true,
    requiresPro: true,
    // No `parameters` — the coach won't expose it; users open the page.
    run: async () => {
      throw new Error("Value Proposition is a multi-step tool. Open the full tool to configure company details.");
    },
  },

  // ── Studio: generate a video from a template + user content ─────────────

  {
    id: "generate_video_from_template",
    label: "Generate video",
    description:
      "Create a new Studio video draft from a template, pre-filled with the user's profile + active resume content. Use whenever the user asks you to 'make a video', 'build a video resume', 'generate a personal-brand video', etc. The Apply step persists the draft and opens the Studio editor. Pick the closest template by intent: 'profile' (intro / promote yourself), 'resume' (work history pitch), 'personal_brand' (career story), 'skills_demo' (showcase specific skills), 'basic' (single-scene from scratch). Other templates are valid but the slot binder doesn't fill them yet — they'll open with placeholder text.",
    icon: Film,
    accentClassName: "bg-brand-blue/10 text-brand-blue",
    route: "/studio",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        templateId: {
          type: "string",
          enum: TEMPLATE_ID_VALUES,
          description: "Which template the new draft starts from. Map the user's intent to the closest id — don't invent values.",
        },
        name: {
          type: "string",
          description: "Optional project name shown in the user's Studio library. Omit to use the template's default name (e.g. 'Video Resume', 'Personal Brand Video').",
        },
        prompt: {
          type: "string",
          description: "Optional user-supplied description / direction (e.g. 'punchy 30s for a Senior PM role'). Captured on the draft so the wizard's regenerate step has context; not used for slot substitution.",
        },
      },
      required: ["templateId"],
      additionalProperties: false,
    },
    run: runGenerateVideoFromTemplate,
  },

  // ── Studio: turn the CURRENT PAGE into a video (SuperAdmin only) ─────────

  {
    id: "generate_video_from_page",
    label: "Video from this page",
    description:
      "Turn the marketing page the user is currently viewing into a short, social-ready Studio video. Reads the live page's headings, copy, images, and call-to-action, then drafts a hook → value points → CTA video. Use when a SuperAdmin asks to 'make a video from this page', 'turn this page into a video', or 'create a promo video for what's on screen'. Takes NO arguments — it always reads the current page automatically. The Apply step persists the draft and opens the Studio editor for review; from there the operator publishes and embeds it back on the page.",
    icon: Film,
    accentClassName: "bg-brand-purple/10 text-brand-purple",
    route: "/studio",
    inputs: [],
    mutates: true,
    requiresSuperAdmin: true,
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Optional project name for the Studio library. Omit to use the AI-generated title.",
        },
      },
      additionalProperties: false,
    },
    run: runGenerateVideoFromPage,
  },

  // ── Studio: generate an image (text→img OR img→img) ─────────────────────

  {
    id: "generate_image",
    label: "Generate image",
    description:
      "Generate an image and save it to the user's media library. Use whenever the user asks you to make, draw, create, render, or design any image — headshots, logos, backgrounds, sprites, scene art, social-post graphics. Pass `prompt` (required) describing what to make. Pass `sourceImageUrl` ONLY when the user wants to REWRITE an existing image they've shared a URL for (the model rewrites it under the new prompt, keeping coarse shape). The image is auto-persisted to the user's R2 library; the returned URL is durable and shows up in the Studio MediaPicker's Library tab. Token cost: ~10K.",
    icon: ImageIcon,
    accentClassName: "bg-brand-purple/10 text-brand-purple",
    route: "/studio",
    inputs: [],
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "What to generate. Write a vivid description — subject, style, lighting, framing. Caps at 500 chars server-side. Example: 'A professional headshot, soft natural light, neutral grey backdrop, business-casual attire.'",
        },
        sourceImageUrl: {
          type: "string",
          description:
            "OPTIONAL. Public CDN URL of an existing image to rewrite under `prompt` (img→img mode). Use ONLY when the user has explicitly shared an image URL they want updated. Omit for fresh generation.",
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    run: runGenerateImage,
  },

  // ── Mutation tools (AI coach edits) ──────────────────────────────────────
  // These all target the user's *active* resume. The chat panel binds
  // `resumeId` into ToolRunContext from the route — the LLM does not pass it.

  {
    id: "apply_resume_rewrite",
    label: "Apply rewrite",
    description: "Replace ONE specific bullet, work summary, or basics summary on the active resume with an improved version. `original` must quote (verbatim or near-verbatim) text that already appears on the resume — the matcher will find the right slot. Use this after the user agrees to a specific rewrite you've proposed.",
    icon: Wand2,
    accentClassName: "bg-amber-100 text-amber-600",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        original: {
          type: "string",
          description: "The bullet/summary text as it currently appears on the resume. Quote verbatim if possible.",
        },
        improved: {
          type: "string",
          description: "The replacement text. One bullet/summary at a time — do not concatenate multiple bullets.",
        },
      },
      required: ["original", "improved"],
      additionalProperties: false,
    },
    run: runApplyResumeRewrite,
  },
  {
    id: "update_resume_summary",
    label: "Update resume summary",
    description: "Replace the resume's `basics.summary` (the headline paragraph at the top) with a new version. Use after the user approves the new summary text.",
    icon: Pencil,
    accentClassName: "bg-brand-green/10 text-brand-green",
    route: "/tools/summarize-resume",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "The new summary paragraph. Plain prose, no bullet glyphs.",
        },
      },
      required: ["summary"],
      additionalProperties: false,
    },
    run: runUpdateResumeSummary,
  },
  {
    id: "add_resume_skill",
    label: "Add skill",
    description: "Append a skill to the active resume's skills list. Idempotent — duplicate skills (case-insensitive name match) are skipped. Use one call per skill.",
    icon: Plus,
    accentClassName: "bg-brand-purple/10 text-brand-purple",
    route: "/tools/skill-extractor",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Skill name (e.g. \"TypeScript\", \"Stakeholder management\")." },
        level: {
          type: "string",
          enum: ["", "Beginner", "Intermediate", "Advanced", "Expert"],
          description: "Optional proficiency. Leave empty if the user hasn't told you.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    run: runAddResumeSkill,
  },
  {
    id: "consolidate_section_highlights",
    label: "Consolidate bullets",
    description: "Collapse near-duplicate / overlapping bullets in ONE resume section (a Work, Volunteer, or Project entry) into a tighter action-verb-led list. The matcher locates the section by content — pass any one bullet that already appears under that entry as `matchHighlight`. Use this when the user (or the optimizer) flags duplicate or overlapping highlights.",
    icon: Layers,
    accentClassName: "bg-blue-100 text-blue-600",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        matchHighlight: {
          type: "string",
          description: "Verbatim or near-verbatim text of any one bullet that appears under the section to consolidate. The matcher walks the resume to find which Work / Volunteer / Project entry contains it, then operates on that entry's full highlights list.",
        },
      },
      required: ["matchHighlight"],
      additionalProperties: false,
    },
    run: runConsolidateSectionHighlights,
  },
  {
    id: "standardize_resume_dates",
    label: "Standardize dates",
    description: "Walk every Work / Volunteer / Project / Education entry on the active resume and normalize its dates to YYYY-MM (preserving day precision when given). Open-ended end dates collapse to 'Present'. Use when the user (or the optimizer) flags inconsistent date formatting that an ATS could mis-parse.",
    icon: CalendarClock,
    accentClassName: "bg-teal-100 text-teal-600",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    run: runStandardizeResumeDates,
  },
  {
    id: "apply_job_draft",
    label: "Apply to job draft",
    description:
      "Write one or more fields into the active Create-Job form. Use this whenever the user asks you to draft, fill in, rewrite, or improve a job posting — instead of dumping a markdown template into chat. Pass only the fields you want to set; omitted fields keep their current value. Each call stages a preview that the user can Apply or Discard.",
    icon: Briefcase,
    accentClassName: "bg-brand-purple/10 text-brand-purple",
    route: "/jobs/create",
    inputs: ["job"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Job title (e.g. 'Senior AI Engineer')." },
        description: {
          type: "string",
          description: "Full job description, plain text or markdown. Replaces the existing description verbatim — write it the way it should appear on the posting.",
        },
        company: { type: "string", description: "Hiring company name." },
        location: { type: "string", description: "Primary location (city, state/country). Use 'Remote' if remote-only." },
        responsibilities: {
          type: "string",
          description: "One responsibility per line, no bullet glyphs. Will be split into a list on save.",
        },
        requirements: {
          type: "string",
          description: "One requirement per line, no bullet glyphs. Will be split into a list on save.",
        },
        employmentType: {
          type: "array",
          items: {
            type: "string",
            enum: ["FullTime", "PartTime", "Freelance", "Contractor", "ContractToHire", "Temporary", "Internship"],
          },
          description: "One or more employment types — most postings are ['FullTime'].",
        },
        seniority: {
          type: "array",
          items: {
            type: "string",
            enum: ["Entry", "Junior", "Mid", "Senior", "LeadExecutive", "None"],
          },
          description: "One or more seniority levels accepted for this role.",
        },
        workSetting: {
          type: "string",
          enum: ["Onsite", "Remote", "Hybrid"],
          description: "Where the work happens day-to-day.",
        },
        salaryMin: { type: "number", description: "Minimum annual salary in the posting's currency." },
        salaryMax: { type: "number", description: "Maximum annual salary in the posting's currency." },
        currency: { type: "string", description: "Currency code (e.g. 'USD', 'EUR'). Default 'USD'." },
      },
      additionalProperties: false,
    },
    run: runApplyJobDraft,
  },
  {
    id: "shorten_bullet",
    label: "Shorten bullet",
    description: "Tighten ONE verbose resume bullet to fit within a character cap, keeping every metric and proper noun verbatim. Pass the original bullet as `original`; the result is staged through the same Apply pipeline as apply_resume_rewrite. Use when the user flags a bullet that runs >2 lines or the optimizer recommends shortening.",
    icon: Scissors,
    accentClassName: "bg-amber-100 text-amber-600",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        original: {
          type: "string",
          description: "The bullet text as it currently appears on the resume. Quote verbatim — the matcher uses this to locate the slot.",
        },
        maxChars: {
          type: "number",
          description: "Optional character cap (40-500). Defaults to 180 if omitted.",
        },
      },
      required: ["original"],
      additionalProperties: false,
    },
    run: runShortenBullet,
  },

  // ── Studio editor tools — drive the open editor (in-studio only) ────────
  // All flagged `requiresStudioEditor` so `getCoachToolSpecs` exposes them
  // to the model ONLY when an editor is mounted. They execute immediately
  // (no Apply step) — the user sees the result on the canvas.
  {
    id: "studio_start_recording",
    label: "Record",
    description:
      "Open the Studio recorder so the user can capture a screen, webcam, or screen+webcam (picture-in-picture) clip. Use this whenever the user asks to 'screen record', 'record my screen', 'record a webcam clip', 'record a demo', etc. — do NOT tell them to find a button. The browser requires a click to start capture, so this surfaces the armed recorder; the finished recording becomes its OWN full-bleed scene, which save & publish stitches in sequence (slide → recording → slide).",
    icon: Clapperboard,
    accentClassName: "bg-brand-purple/10 text-brand-purple",
    route: "/studio",
    inputs: ["video"],
    requiresStudioEditor: true,
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["screen", "webcam", "screen-pip"],
          description:
            "What to record: 'screen' (the headline ask), 'webcam' (camera only), or 'screen-pip' (screen with a webcam overlay). Default 'screen'.",
        },
      },
      additionalProperties: false,
    },
    run: runStudioStartRecording,
  },
  {
    id: "studio_insert_widget",
    label: "Insert widget",
    description:
      "Add a widget to the active scene of the open Studio video — text, heading, image, video, shapes, chart, CTA card, chips, AI presenter, etc. Use when the user asks you to add an element to their video. The widget lands with placeholder content the user can then edit; set its text/source with the dedicated tools or by guiding the user.",
    icon: Shapes,
    accentClassName: "bg-brand-blue/10 text-brand-blue",
    route: "/studio",
    inputs: ["video"],
    requiresStudioEditor: true,
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: INSERTABLE_WIDGET_KINDS as unknown as string[],
          description:
            "Which widget to insert. Some kinds (comic primitives) are only valid on comic projects — the tool validates against the open project and tells you if it's not allowed.",
        },
      },
      required: ["kind"],
      additionalProperties: false,
    },
    run: runStudioInsertWidget,
  },
  {
    id: "studio_list_scenes",
    label: "List scenes",
    description:
      "List the scenes in the open Studio video with their ids, labels, durations, and widget counts. Call this FIRST when the user wants to duplicate, delete, reorder, recolor, or switch to a scene — the other scene tools need the scene id this returns.",
    icon: ListTree,
    accentClassName: "bg-brand-green/10 text-brand-green",
    route: "/studio",
    inputs: ["video"],
    requiresStudioEditor: true,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    run: runStudioListScenes,
  },
  {
    id: "studio_add_scene",
    label: "Add scene",
    description: "Append a new blank scene to the open Studio video. Returns the new scene's id.",
    icon: Plus,
    accentClassName: "bg-brand-purple/10 text-brand-purple",
    route: "/studio",
    inputs: ["video"],
    requiresStudioEditor: true,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    run: runStudioAddScene,
  },
  {
    id: "studio_duplicate_scene",
    label: "Duplicate scene",
    description: "Duplicate a scene in the open Studio video. Pass the scene id from studio_list_scenes.",
    icon: Copy,
    accentClassName: "bg-brand-blue/10 text-brand-blue",
    route: "/studio",
    inputs: ["video"],
    requiresStudioEditor: true,
    parameters: {
      type: "object",
      properties: { sceneId: { type: "string", description: "Id of the scene to duplicate." } },
      required: ["sceneId"],
      additionalProperties: false,
    },
    run: runStudioDuplicateScene,
  },
  {
    id: "studio_delete_scene",
    label: "Delete scene",
    description: "Delete a scene from the open Studio video. Pass the scene id from studio_list_scenes. The editor refuses to delete the last remaining scene.",
    icon: Trash2,
    accentClassName: "bg-red-100 text-red-600",
    route: "/studio",
    inputs: ["video"],
    requiresStudioEditor: true,
    parameters: {
      type: "object",
      properties: { sceneId: { type: "string", description: "Id of the scene to delete." } },
      required: ["sceneId"],
      additionalProperties: false,
    },
    run: runStudioDeleteScene,
  },
  {
    id: "studio_reorder_scenes",
    label: "Reorder scenes",
    description: "Reorder the scenes of the open Studio video. Pass ALL scene ids in the desired order (get them from studio_list_scenes).",
    icon: Layers,
    accentClassName: "bg-indigo-100 text-indigo-600",
    route: "/studio",
    inputs: ["video"],
    requiresStudioEditor: true,
    parameters: {
      type: "object",
      properties: {
        orderedIds: {
          type: "array",
          items: { type: "string" },
          description: "Scene ids in the new order, first to last.",
        },
      },
      required: ["orderedIds"],
      additionalProperties: false,
    },
    run: runStudioReorderScenes,
  },
  {
    id: "studio_activate_scene",
    label: "Go to scene",
    description: "Switch the Studio editor's focus to a specific scene so subsequent inserts land there. Pass the scene id from studio_list_scenes.",
    icon: Target,
    accentClassName: "bg-teal-100 text-teal-600",
    route: "/studio",
    inputs: ["video"],
    requiresStudioEditor: true,
    parameters: {
      type: "object",
      properties: { sceneId: { type: "string", description: "Id of the scene to make active." } },
      required: ["sceneId"],
      additionalProperties: false,
    },
    run: runStudioActivateScene,
  },
  {
    id: "studio_set_scene_background",
    label: "Scene background",
    description: "Set a scene's solid background colour in the open Studio video. Defaults to the active scene when no sceneId is given.",
    icon: Paintbrush,
    accentClassName: "bg-amber-100 text-amber-600",
    route: "/studio",
    inputs: ["video"],
    requiresStudioEditor: true,
    parameters: {
      type: "object",
      properties: {
        color: { type: "string", description: "6-digit hex colour, e.g. \"#0f172a\"." },
        sceneId: { type: "string", description: "Optional scene id; omit to recolor the active scene." },
      },
      required: ["color"],
      additionalProperties: false,
    },
    run: runStudioSetSceneBackground,
  },
  {
    id: "studio_capture_screenshot",
    label: "Screenshot to canvas",
    description: "Open the browser screenshot picker and drop the captured window/tab/screen onto the active scene as an image. Use when the user wants to grab something on screen into their video.",
    icon: Camera,
    accentClassName: "bg-brand-blue/10 text-brand-blue",
    route: "/studio",
    inputs: ["video"],
    requiresStudioEditor: true,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    run: runStudioCaptureScreenshot,
  },
  {
    id: "studio_add_image",
    label: "Add image to scene",
    description: "Add an image (by public URL) to the active scene of the open Studio video. Pairs with generate_image: generate an image, then pass its returned URL here to drop it on the canvas.",
    icon: ImageIcon,
    accentClassName: "bg-brand-purple/10 text-brand-purple",
    route: "/studio",
    inputs: ["video"],
    requiresStudioEditor: true,
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "Public image URL to insert." } },
      required: ["url"],
      additionalProperties: false,
    },
    run: runStudioAddImage,
  },
  {
    id: "studio_add_video",
    label: "Add video to scene",
    description: "Add a video (by public URL) to the active scene of the open Studio video. The active scene's duration extends to fit the clip.",
    icon: Film,
    accentClassName: "bg-brand-blue/10 text-brand-blue",
    route: "/studio",
    inputs: ["video"],
    requiresStudioEditor: true,
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public video URL to insert." },
        durationSeconds: { type: "number", description: "Clip duration in seconds (extends the scene). Optional." },
      },
      required: ["url"],
      additionalProperties: false,
    },
    run: runStudioAddVideo,
  },
];

/**
 * Serialize the tools the AI coach should expose to the LLM. Filters to
 * tools that declare a JSON-schema `parameters` block — wizards and
 * page-only tools are intentionally left out.
 *
 * Single source of truth: the chat panel calls this on every request so
 * adding a tool to the registry automatically exposes it to the model.
 */
export function getCoachToolSpecs(opts?: { superAdmin?: boolean }): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: NonNullable<ToolDefinition["parameters"]>;
  };
}> {
  const superAdmin = opts?.superAdmin === true;
  // Studio editor tools only make sense — and only work — when an editor
  // is mounted in this tab. Self-gate on the bridge so the model sees
  // "record / insert widget / add scene" in /studio and nowhere else
  // (no contextType plumbing needed; one predicate, computed here).
  const studioEditorOpen = getStudioEditor() !== null;
  return toolRegistry
    .filter((t) => t.parameters)
    // SuperAdmin-only tools are never exposed to the model for other
    // users — the backend route enforces the same gate as a backstop.
    .filter((t) => (t.requiresSuperAdmin ? superAdmin : true))
    .filter((t) => (t.requiresStudioEditor ? studioEditorOpen : true))
    .map((t) => ({
      type: "function",
      function: {
        name: t.id,
        description: t.description,
        parameters: t.parameters!,
      },
    }));
}

export function getTool(id: string): ToolDefinition | undefined {
  return toolRegistry.find((t) => t.id === id);
}

/**
 * Tools available from a given entity's context menu — any tool whose
 * inputs include that entity type. Additional inputs are gathered in the
 * dialog (e.g. a pasted job description for a resume-anchored tailor run).
 */
export function getToolsForContext(entity: ToolEntityType): ToolDefinition[] {
  return toolRegistry.filter((t) => t.inputs.includes(entity));
}

/** Tools that can't run inside the quick-run dialog (full page only). */
const FULL_PAGE_ONLY = new Set<string>(["value-proposition"]);

export function isInlineRunnable(tool: ToolDefinition): boolean {
  return !FULL_PAGE_ONLY.has(tool.id);
}
