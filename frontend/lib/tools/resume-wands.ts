/**
 * The résumé wands that close the analyzer's coverage gap (#375): each is a
 * registry tool (spread into lib/tools/registry.ts), so the analyzer's
 * structured action (#374), the AI Brain and a page finding all run the
 * same thing — never a branch in a component.
 *
 *   merge_work_entries       two work entries that are one role → one
 *   add_bullet_metric        a bullet rewritten to lead with an outcome
 *   strengthen_bullet_verbs  a weak opening verb replaced
 *   init_resume_section      a missing Summary / Skills section, started
 *                            from what the résumé already says
 *
 * Each run stages a pending change (preview + Apply on the card); the bullet
 * rewrites ride on apply_resume_rewrite's commit, the rest commit here.
 */
import type { QueryClient } from "@tanstack/react-query";
import { GitMerge, ListPlus, TrendingUp, Zap } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import i18n from "@/lib/i18n/i18n";
import {
  INIT_RESUME_SECTIONS,
  RewriteBulletResponseSchema,
  type BulletRewriteMode,
  type InitResumeSection,
} from "@shared/tool-schemas";
import { readResumeContent, resolveResumeText, writeResumeContent } from "./resume-content";
import { mergeWorkEntries } from "./merge-work-entries";
import type { NormalizedToolRunResult, ToolDefinition, ToolRunContext } from "./types";

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function requireResume(ctx: ToolRunContext): string {
  const { resumeId } = ctx.bound;
  if (!resumeId) throw new Error(i18n.t("wands.noResume"));
  return resumeId;
}

// ── Bullet rewrites (metric / verbs) ────────────────────────────────────────

function bulletRewriter(mode: BulletRewriteMode) {
  return async (ctx: ToolRunContext): Promise<NormalizedToolRunResult> => {
    const original = str(ctx.args.original);
    if (!original) throw new Error(i18n.t("wands.needsBullet"));
    const resumeId = requireResume(ctx);
    const { data } = await apiClient.post(
      "/api/resumeoptimizer/rewrite-bullet",
      { original, mode },
      RewriteBulletResponseSchema,
    );
    const improved = data.improved.trim();
    if (!improved || improved === original) throw new Error(i18n.t("wands.noChange"));
    return {
      summary: i18n.t(mode === "metric" ? "wands.metric.summary" : "wands.verbs.summary"),
      previewText: `${i18n.t("wands.before")}\n${original}\n\n${i18n.t("wands.after")}\n${improved}`,
      mutation: { status: "pending" },
      // One matcher + one persistence path for every bullet rewrite.
      raw: { kind: "apply_resume_rewrite", resumeId, original, improved },
    };
  };
}

// ── Merge two work entries ──────────────────────────────────────────────────

async function runMergeWorkEntries(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const first = str(ctx.args.first);
  const second = str(ctx.args.second);
  if (!first || !second) throw new Error(i18n.t("wands.merge.needsBoth"));
  const resumeId = requireResume(ctx);
  const content = await readResumeContent(resumeId);
  if (!content) throw new Error(i18n.t("wands.noContent"));
  const merge = mergeWorkEntries(content, first, second);
  if (!merge) throw new Error(i18n.t("wands.merge.notFound", { first, second }));
  const kept = merge.next.work?.[merge.keep];
  return {
    summary: i18n.t("wands.merge.summary", { label: merge.label }),
    previewText: [kept?.position, kept?.name, `${kept?.startDate ?? ""} – ${kept?.endDate || i18n.t("wands.present")}`, ...(kept?.highlights ?? []).map((h) => `• ${h}`)]
      .filter(Boolean)
      .join("\n"),
    mutation: { status: "pending", location: `work[${merge.keep}]` },
    raw: { kind: "merge_work_entries", resumeId, first, second },
  };
}

// ── Start a missing section ─────────────────────────────────────────────────

async function draftSummary(ctx: ToolRunContext): Promise<string> {
  const resumeText = await resolveResumeText(ctx);
  const { data } = await apiClient.post<unknown>("/api/resumes/summarize", { resumeText });
  const d = data as { result?: unknown; summary?: unknown } | string;
  const summary = typeof d === "string" ? d : String(d?.result ?? d?.summary ?? "");
  return summary.trim();
}

async function draftSkills(ctx: ToolRunContext): Promise<string[]> {
  const content = await resolveResumeText(ctx);
  const { data } = await apiClient.post<{ skills?: Array<{ name?: unknown }> }>("/api/skillextractor/extract", {
    content,
    sourceType: "resume",
  });
  const names = (data?.skills ?? []).map((s) => (typeof s.name === "string" ? s.name.trim() : "")).filter(Boolean);
  return [...new Map(names.map((n) => [n.toLowerCase(), n])).values()].slice(0, 20);
}

async function runInitResumeSection(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const section = str(ctx.args.section) as InitResumeSection | undefined;
  if (!section || !INIT_RESUME_SECTIONS.includes(section)) throw new Error(i18n.t("wands.init.badSection"));
  const resumeId = requireResume(ctx);
  if (section === "summary") {
    const summary = await draftSummary(ctx);
    if (!summary) throw new Error(i18n.t("wands.noChange"));
    return {
      summary: i18n.t("wands.init.summary"),
      previewText: summary,
      mutation: { status: "pending", location: "basics.summary" },
      // Same commit as the summary tool.
      raw: { kind: "update_resume_summary", resumeId, summary },
    };
  }
  const skills = await draftSkills(ctx);
  if (skills.length === 0) throw new Error(i18n.t("wands.noChange"));
  return {
    summary: i18n.t("wands.init.skills", { count: skills.length }),
    previewText: skills.join(", "),
    mutation: { status: "pending", location: "skills" },
    raw: { kind: "init_resume_skills", resumeId, skills },
  };
}

/**
 * Commit a pending change these wands staged (the card's Apply). Null when
 * the change is not one of theirs. Re-runs on the CURRENT draft — the
 * person may have edited since the preview — as one Undo step.
 */
export async function commitResumeWandMutation(
  result: NormalizedToolRunResult,
  queryClient?: QueryClient,
): Promise<NormalizedToolRunResult | null> {
  const raw = (result.raw ?? {}) as { kind?: string; resumeId?: string } & Record<string, unknown>;
  if (raw.kind === "merge_work_entries") {
    if (!raw.resumeId) throw new Error(i18n.t("wands.noResume"));
    const wrote = await writeResumeContent(
      raw.resumeId,
      (copy) => mergeWorkEntries(copy, String(raw.first ?? ""), String(raw.second ?? ""))?.next ?? null,
      "ai:merge-work",
      queryClient,
    );
    if (!wrote) throw new Error(i18n.t("wands.merge.notFound", { first: String(raw.first), second: String(raw.second) }));
    return { ...result, mutation: { status: "applied", location: result.mutation?.location } };
  }
  if (raw.kind === "init_resume_skills") {
    if (!raw.resumeId) throw new Error(i18n.t("wands.noResume"));
    const names = Array.isArray(raw.skills) ? raw.skills.filter((s): s is string => typeof s === "string") : [];
    await writeResumeContent(
      raw.resumeId,
      (copy) => {
        const have = new Set((copy.skills ?? []).map((s) => (s.name ?? "").toLowerCase()));
        const add = names.filter((n) => !have.has(n.toLowerCase()));
        if (add.length === 0) return null;
        copy.skills = [...(copy.skills ?? []), ...add.map((name) => ({ name, level: "", keywords: [] }))];
        return copy;
      },
      "ai:skills",
      queryClient,
    );
    return { ...result, mutation: { status: "applied", location: "skills" } };
  }
  return null;
}

export const resumeWandTools: ToolDefinition[] = [
  {
    id: "merge_work_entries",
    label: "Merge work entries",
    description:
      "Merge two Work entries on the active resume that are really one role (the same company listed twice, a promotion split in two). Keeps the first entry's title, adds the second's bullets it lacks, spans both date ranges, removes the second. Pass each entry's company name.",
    icon: GitMerge,
    accentClassName: "bg-blue-100 text-blue-600",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        first: { type: "string", description: "Company name of the entry to keep." },
        second: { type: "string", description: "Company name of the entry to merge into it." },
      },
      required: ["first", "second"],
      additionalProperties: false,
    },
    run: runMergeWorkEntries,
  },
  {
    id: "add_bullet_metric",
    label: "Add a metric",
    description:
      "Rewrite ONE resume bullet to lead with a measurable outcome. Never invents numbers: where the resume has none it writes a bracketed placeholder ([N]%, [$X]) for the user to fill. Pass the bullet verbatim as `original`.",
    icon: TrendingUp,
    accentClassName: "bg-brand-green/10 text-brand-green",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    mutates: true,
    requiresPro: true,
    parameters: {
      type: "object",
      properties: { original: { type: "string", description: "The bullet as it appears on the resume." } },
      required: ["original"],
      additionalProperties: false,
    },
    run: bulletRewriter("metric"),
  },
  {
    id: "strengthen_bullet_verbs",
    label: "Strengthen the verb",
    description:
      "Rewrite ONE resume bullet that opens weakly ('Responsible for', 'Helped', 'Worked on') to open with a strong, specific action verb — same meaning and scope. Pass the bullet verbatim as `original`.",
    icon: Zap,
    accentClassName: "bg-amber-100 text-amber-600",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    mutates: true,
    requiresPro: true,
    parameters: {
      type: "object",
      properties: { original: { type: "string", description: "The bullet as it appears on the resume." } },
      required: ["original"],
      additionalProperties: false,
    },
    run: bulletRewriter("verbs"),
  },
  {
    id: "init_resume_section",
    label: "Add a missing section",
    description:
      "Start a missing Summary or Skills section on the active resume from what the resume already says (a summary paragraph, or the skills its experience shows). Use when the resume has no summary / no skills list.",
    icon: ListPlus,
    accentClassName: "bg-brand-primary/10 text-brand-primary",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    mutates: true,
    requiresPro: true,
    parameters: {
      type: "object",
      properties: { section: { type: "string", enum: [...INIT_RESUME_SECTIONS], description: "Which section to start." } },
      required: ["section"],
      additionalProperties: false,
    },
    run: runInitResumeSection,
  },
];
