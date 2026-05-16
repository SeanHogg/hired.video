// save-pipeline-steps.ts — derive the user-visible step list for the
// Save and Publish button popovers from the project's current status.
// Centralises the status → step mapping so SaveButton, the Publish
// menu, and any progress dialogs all read the same source of truth
// (per the DRY rule — the gates and labels live here, consumers
// self-render from the returned list).
//
// The two pipelines share the same step ids ("generate" / "render" /
// "upload") because they really are the same atomic operations — what
// differs is which steps each verb runs by default:
//   • Save  → persist JSON; optionally re-generate. NEVER renders.
//   • Publish-to-X → render + upload (lazily — skipped when the baked
//                    video is still fresh per `isBakedFresh()`). Each
//                    publish destination then layers its own platform
//                    handler (LinkedIn post, YouTube upload, etc.) on
//                    top of the rendered MP4.

import type { StudioProjectState } from "@/types/studio";

export type StepStatus = "pending" | "active" | "done" | "error";
export type StepId = "generate" | "render" | "upload";

export interface PipelineStep {
  id: StepId;
  label: string;
  status: StepStatus;
  /** Optional 0–1 progress, currently only populated for the render step. */
  progress?: number;
}

export interface DeriveStepsInput {
  state: StudioProjectState;
  /** Render progress streamed by `useExportProgress()` (0–1). */
  exportProgress?: number;
}

/**
 * Inputs:
 *   state.status       — "idle" | "generating" | "ready" | "exporting" | "uploading" | "publishing" | "done" | "error"
 *   state.script       — truthy once the LLM finished generating
 *   state.videoBlob    — truthy after a render finishes (in-memory)
 *   state.videoUrl     — truthy after the upload to R2 finishes
 *
 * Output: ordered step list with each step's current status. The render
 * step also carries the live progress fraction so the popover can show a
 * percentage without a second hook.
 */
export function deriveSavePipelineSteps({ state, exportProgress }: DeriveStepsInput): PipelineStep[] {
  const hasScript = !!state.script;
  const hasBlob   = state.videoBlob != null;
  const hasUrl    = state.videoUrl != null;
  const isError   = state.status === "error";

  // Generate
  let generate: StepStatus;
  if (state.status === "generating")        generate = "active";
  else if (hasScript)                       generate = "done";
  else if (isError && !hasScript)           generate = "error";
  else                                      generate = "pending";

  // Render
  let render: StepStatus;
  if (state.status === "exporting")         render = "active";
  else if (hasBlob || hasUrl)               render = "done";
  else if (isError && hasScript && !hasBlob && !hasUrl) render = "error";
  else                                      render = "pending";

  // Upload (R2)
  let upload: StepStatus;
  if (state.status === "uploading")         upload = "active";
  else if (hasUrl)                          upload = "done";
  else if (isError && hasBlob && !hasUrl)   upload = "error";
  else                                      upload = "pending";

  return [
    { id: "generate", label: "Generate script", status: generate },
    { id: "render",   label: "Render video",    status: render, progress: render === "active" ? exportProgress : undefined },
    { id: "upload",   label: "Upload to library", status: upload },
  ];
}
