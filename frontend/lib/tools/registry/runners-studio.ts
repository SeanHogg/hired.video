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

import type { WidgetKind } from "@/lib/studio/editor-v2/canvas-state";
import {
  requireStudioEditor,
  type StudioRecordingMode,
} from "@/lib/studio/editor-v2/studio-editor-bridge";
import type { NormalizedToolRunResult, ToolRunContext } from "../types";
import { asString as asTrimmed } from "./shared";

const RECORDING_MODES: readonly StudioRecordingMode[] = [
  "screen",
  "webcam",
  "screen-pip",
];

export async function runStudioStartRecording(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const raw = ctx.args.mode;
  const mode: StudioRecordingMode = RECORDING_MODES.includes(raw as StudioRecordingMode)
    ? (raw as StudioRecordingMode)
    : "screen";
  // Auto-start the live preview (getUserMedia). MediaRecorder itself still
  // needs a click — the browser won't grant getDisplayMedia from a tool
  // call — so the armed recorder's Record button is the remaining gesture.
  const editor = requireStudioEditor();
  if (!editor.supportsRecording) {
    throw new Error(
      "Recording isn't available for this project type. Open a video, podcast, voice, or comic in Studio.",
    );
  }
  editor.openRecorder(mode, { asScene: true, autoStart: true });
  const label =
    mode === "webcam" ? "webcam" : mode === "screen-pip" ? "screen + webcam" : "screen";
  return {
    summary: `Opened the ${label} recorder and started the live preview. Click Record to capture — your recording becomes its own scene, so you can stitch slide → recording → slide on save.`,
    raw: { kind: "studio_start_recording", mode },
  };
}

export async function runStudioInsertWidget(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
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

export async function runStudioAddScene(): Promise<NormalizedToolRunResult> {
  const sceneId = requireStudioEditor().addScene();
  return {
    summary: "Added a new blank scene.",
    raw: { kind: "studio_add_scene", sceneId },
  };
}

export async function runStudioDuplicateScene(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const sceneId = asTrimmed(ctx.args.sceneId);
  if (!sceneId) throw new Error("studio_duplicate_scene requires `sceneId` (call studio_list_scenes to get ids).");
  requireStudioEditor().duplicateScene(sceneId);
  return { summary: "Duplicated the scene.", raw: { kind: "studio_duplicate_scene", sceneId } };
}

export async function runStudioDeleteScene(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const sceneId = asTrimmed(ctx.args.sceneId);
  if (!sceneId) throw new Error("studio_delete_scene requires `sceneId` (call studio_list_scenes to get ids).");
  requireStudioEditor().deleteScene(sceneId);
  return { summary: "Deleted the scene.", raw: { kind: "studio_delete_scene", sceneId } };
}

export async function runStudioReorderScenes(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const orderedIds = Array.isArray(ctx.args.orderedIds)
    ? ctx.args.orderedIds.filter((v): v is string => typeof v === "string")
    : [];
  if (orderedIds.length === 0) {
    throw new Error("studio_reorder_scenes requires `orderedIds` — the scene ids in the new order.");
  }
  requireStudioEditor().reorderScenes(orderedIds);
  return { summary: "Reordered the scenes.", raw: { kind: "studio_reorder_scenes", orderedIds } };
}

export async function runStudioActivateScene(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const sceneId = asTrimmed(ctx.args.sceneId);
  if (!sceneId) throw new Error("studio_activate_scene requires `sceneId`.");
  requireStudioEditor().setActiveScene(sceneId);
  return { summary: "Switched to the scene.", raw: { kind: "studio_activate_scene", sceneId } };
}

export async function runStudioSetSceneBackground(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const color = asTrimmed(ctx.args.color);
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error("studio_set_scene_background requires `color` as a 6-digit hex (e.g. \"#0f172a\").");
  }
  const editor = requireStudioEditor();
  const sceneId = asTrimmed(ctx.args.sceneId) ?? editor.getActiveSceneId();
  editor.setSceneBackground(sceneId, color);
  return { summary: `Set the scene background to ${color}.`, raw: { kind: "studio_set_scene_background", sceneId, color } };
}

export async function runStudioCaptureScreenshot(): Promise<NormalizedToolRunResult> {
  await requireStudioEditor().captureScreenshot();
  return {
    summary: "Opened the screenshot picker — pick a window/tab/screen to capture it onto the scene.",
    raw: { kind: "studio_capture_screenshot" },
  };
}

export async function runStudioAddImage(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const url = asTrimmed(ctx.args.url);
  if (!url) throw new Error("studio_add_image requires `url` (a public image URL — e.g. one returned by generate_image).");
  requireStudioEditor().addImageWidget(url);
  return { summary: "Added the image to the active scene.", raw: { kind: "studio_add_image", url } };
}

export async function runStudioAddVideo(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const url = asTrimmed(ctx.args.url);
  if (!url) throw new Error("studio_add_video requires `url` (a public video URL).");
  const durationSeconds = typeof ctx.args.durationSeconds === "number" ? ctx.args.durationSeconds : 0;
  requireStudioEditor().addVideoWidget(url, durationSeconds);
  return { summary: "Added the video to the active scene.", raw: { kind: "studio_add_video", url, durationSeconds } };
}

export async function runStudioListScenes(): Promise<NormalizedToolRunResult> {
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
