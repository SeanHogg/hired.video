// Persist a staged (`mutation: { status: "pending" }`) tool result. One
// dispatch table keyed by `raw.kind`; journey-tool and résumé-wand kinds are
// delegated to their own commit functions first.

import type { QueryClient } from "@tanstack/react-query";
import type { PageVideoSpec } from "@shared/page-video-spec";
import { studioService } from "@/lib/services/studio-service";
import { queryKeys } from "@/lib/query-keys";
import { synthesizePendingNarration } from "@/lib/studio/page-narration";
import { pageVideoSpecToCanvas } from "@/lib/studio/editor-v2/page-spec-to-canvas";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import { applyResumeRewrite } from "../apply-rewrite";
import { setSectionHighlights } from "../find-section";
import { commitJourneyMutation } from "../journey-tools";
import { writeResumeContent } from "../resume-content";
import { commitResumeWandMutation } from "../resume-wands";
import { standardizeResumeDates } from "../standardize-dates";
import type { NormalizedToolRunResult } from "../types";
import { commitJobDraft, type JobDraftFields } from "./job-draft";

type DraftInput = Parameters<typeof studioService.saveDraft>[0];

const EMPTY_BASICS = { name: "", label: "", image: "", email: "", phone: "", url: "", summary: "" };

function errorMessage(err: unknown): string | undefined {
  const message = (err as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" && message ? message : undefined;
}

async function saveStudioDraft(
  result: NormalizedToolRunResult,
  input: DraftInput,
  summary: string,
  queryClient: QueryClient | undefined,
  query = "",
): Promise<NormalizedToolRunResult> {
  const created = await studioService.saveDraft(input);
  const projectId = created.data?.id;
  if (!projectId) throw new Error("Studio draft created but no id returned");
  await queryClient?.invalidateQueries({ queryKey: queryKeys.studioProjects.all });
  return {
    ...result,
    summary,
    mutation: { status: "applied", location: `studio:${projectId}` },
    redirectUrl: `/studio/${encodeURIComponent(projectId)}${query}`,
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
    const journey = await commitJourneyMutation(result, queryClient);
    if (journey) return journey;
    const wand = await commitResumeWandMutation(result, queryClient);
    if (wand) return wand;

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
      const summary = String(raw.summary ?? "");
      await writeResumeContent(
        raw.resumeId,
        (next) => {
          next.basics = { ...(next.basics ?? EMPTY_BASICS), summary };
          return next;
        },
        "ai:summary",
        queryClient,
      );
      return { ...result, mutation: { status: "applied", location: "basics.summary" } };
    }

    if (raw.kind === "add_resume_skill") {
      if (!raw.resumeId) throw new Error("Missing resumeId");
      const name = String(raw.name ?? "");
      const level = String(raw.level ?? "");
      // Skip duplicates (case-insensitive) so the LLM can re-call without harm.
      await writeResumeContent(
        raw.resumeId,
        (next) => {
          const skills = Array.isArray(next.skills) ? next.skills : [];
          if (skills.some((s) => s.name?.toLowerCase() === name.toLowerCase())) return null;
          next.skills = [...skills, { name, level, keywords: [] }];
          return next;
        },
        "ai:skill",
        queryClient,
      );
      return { ...result, mutation: { status: "applied", location: "skills" } };
    }

    if (raw.kind === "consolidate_section_highlights") {
      if (!raw.resumeId) throw new Error("Missing resumeId");
      const sectionKind = raw.sectionKind as "work" | "volunteer" | "projects";
      const sectionIndex = raw.sectionIndex as number;
      const consolidated = (raw.consolidated as string[]) ?? [];
      await writeResumeContent(
        raw.resumeId,
        (next) => {
          setSectionHighlights(next, { kind: sectionKind, index: sectionIndex }, consolidated);
          return next;
        },
        "ai:consolidate",
        queryClient,
      );
      return {
        ...result,
        mutation: { status: "applied", location: `${sectionKind}[${sectionIndex}].highlights` },
      };
    }

    if (raw.kind === "standardize_resume_dates") {
      if (!raw.resumeId) throw new Error("Missing resumeId");
      // Re-run on the CURRENT content: the user may have edited since the preview.
      await writeResumeContent(
        raw.resumeId,
        (next) => standardizeResumeDates(next).next,
        "ai:dates",
        queryClient,
      );
      return { ...result, mutation: { status: "applied", location: "dates" } };
    }

    if (raw.kind === "generate_video_from_template") {
      const name = String(raw.name ?? "");
      const hydrated = raw.hydrated as Parameters<typeof canvasStateToTimeline>[0];
      const purpose = raw.purpose as DraftInput["purpose"];
      const prompt = typeof raw.prompt === "string" ? raw.prompt : undefined;
      return await saveStudioDraft(
        result,
        {
          name,
          kind: "nle",
          timelineSpec: canvasStateToTimeline(hydrated),
          purpose,
          ...(prompt ? { prompt } : {}),
        },
        `Created "${name}" — open it to edit, record, or generate the voiceover.`,
        queryClient,
      );
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
      // Carry the source page through to the editor so the Embed dialog
      // pre-fills "Publish to page" with the page this video was built
      // from (no draft column needed — survives the redirect; #1862).
      const sourcePath = typeof raw.sourcePath === "string" ? raw.sourcePath : "";
      const embedQuery = sourcePath ? `?embedPath=${encodeURIComponent(sourcePath)}` : "";
      return await saveStudioDraft(
        result,
        { name, kind: "nle", mediaKind: "video", timelineSpec: canvasStateToTimeline(narrated) },
        `Created "${name}" — review it in Studio, then publish & embed.`,
        queryClient,
        embedQuery,
      );
    }

    if (raw.kind === "apply_job_draft") {
      const provided = commitJobDraft(String(raw.formId ?? ""), (raw.fields ?? {}) as JobDraftFields);
      return { ...result, mutation: { status: "applied", location: provided.join(", ") } };
    }

    throw new Error(`Unknown mutation kind: ${raw.kind}`);
  } catch (err) {
    return {
      ...result,
      mutation: { status: "failed", location: result.mutation?.location },
      summary: errorMessage(err) || "Apply failed",
    };
  }
}
