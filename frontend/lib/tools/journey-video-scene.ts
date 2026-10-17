/**
 * The résumé video (the kit workspace): one scene's wording, voiceover or
 * on/off. `edit_resume_video_scene` edits the video plan stored on the
 * résumé at `content.meta.video`, so the AI's changes land as Undo steps.
 * Split out of journey-tools.ts, which spreads `editVideoSceneTool` in.
 */
import type { QueryClient } from "@tanstack/react-query";
import { Clapperboard } from "lucide-react";
import {
  ScenePlanSchema,
  VIDEO_SCENE_IDS,
  isLastSceneOn,
  patchScenePlan,
  readVideoPlan,
  withVideoPlan,
  type VideoSceneId,
} from "@shared/video-plan";
import { readResumeContent, writeResumeContent } from "./resume-content";
import type { NormalizedToolRunResult, ToolDefinition, ToolRunContext } from "./types";

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

export const editVideoSceneTool: ToolDefinition = {
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
};
