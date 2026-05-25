// Generalized tool abstraction. A Tool can take one or more entity inputs
// (resume, job, video, template, company) and optionally free-form text
// (e.g. a pasted job description). Context menus filter the registry by
// which entity they live on; the dialog collects any remaining inputs;
// the history panel shows runs that reference that entity.

import type { LucideIcon } from "lucide-react";

export type ToolEntityType = "resume" | "job" | "video" | "template" | "company";

/** Entity references the calling surface (page, dialog anchor) has bound
 *  for this run. The LLM cannot set or override these — they reflect the
 *  user's current context, not the tool's arguments. */
export interface ToolBoundContext {
  resumeId?: string;
  jobId?: string;
  videoId?: string;
  templateId?: string;
  companyId?: string;
}

/** Single shape every tool runner receives. The split is semantic:
 *
 *  • `bound` — entity refs the *surface* controls (route, dialog anchor).
 *  • `args`  — everything else the tool needs, conforming to its
 *              `parameters` JSON schema. AIChatPanel passes the parsed
 *              LLM tool-call arguments straight through; ToolDialog and
 *              the recommendation wand buttons pack their form inputs
 *              into the same shape. One reader path, no per-caller
 *              destructure ambiguity. */
export interface ToolRunContext {
  bound: ToolBoundContext;
  args: Record<string, unknown>;
}

/** Normalized result shape rendered by the shared result panel. */
export interface NormalizedToolRunResult {
  overallScore?: number;
  grade?: string;
  categoryScores?: Array<{ label: string; score: number }>;
  strengths?: string[];
  weaknesses?: string[];
  recommendations?: Array<{
    category?: "critical" | "important" | "minor";
    title: string;
    description?: string;
    impact?: number | string;
  }>;
  summary?: string;
  extras?: Array<{ label: string; value: string }>;
  /** For mutating tools: the human-readable preview of the change the LLM
   *  is proposing (e.g. "Replace work[0].highlights[2] with ‘Shipped …’").
   *  The ToolCallCard renders this above the Apply button. */
  previewText?: string;
  /** For mutating tools: status of the actual mutation. `pending` means
   *  the runner staged the change and is waiting for the user to click
   *  Apply (or for auto-apply to fire). `applied` means the change is on
   *  disk. `failed` carries `summary` as the error message. */
  mutation?: { status: "pending" | "applied" | "failed"; location?: string };
  /** Populated by `commitMutation` for tools whose Apply step produces a
   *  new resource the user should jump to (e.g. the studio draft created
   *  by `generate_video_from_template`). ToolCallCard renders an Open
   *  button when this is set on a successfully-applied result. App-local
   *  path, leading slash — no external URLs. */
  redirectUrl?: string;
  /** Inline image preview — ToolCallCard renders this as an `<img>`
   *  below the summary. Used by `generate_image` so the user sees the
   *  result without clicking through the URL. Public CDN URL only. */
  mediaPreviewUrl?: string;
  raw?: unknown;
}

/** JSON Schema for a tool's parameters, in the OpenAI/Anthropic
 *  function-calling format. Sent to the LLM verbatim when the AI coach
 *  exposes the registry as callable tools. Only fields the LLM needs to
 *  pass go here — implicit context (active resumeId, current user) is
 *  injected by the caller into `ToolRunContext`. */
export interface ToolParametersSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolDefinition {
  /** Stable identifier persisted to tool_runs.tool_id. */
  id: string;
  /** Short label shown in menus + headers. */
  label: string;
  /** One-liner description shown in the dialog header AND sent to the LLM
   *  as the function description, so write it for both audiences. */
  description: string;
  icon: LucideIcon;
  /** Accent Tailwind class for the header icon tile. */
  accentClassName?: string;
  /** Full-page route for users who want the standalone tool. */
  route: string;
  /**
   * Which entity types this tool consumes. Menus filter to tools whose
   * inputs include the current context's entity type. The dialog
   * gathers any missing inputs (e.g. a pasted job description).
   */
  inputs: ToolEntityType[];
  /** Whether the tool produces a single 0–100 score we can chart. */
  producesScore?: boolean;
  /**
   * If true, the full tool run is gated behind a paid tier. The frontend
   * shows a PRO badge on the menu item, tool card, and tool page, and the
   * dialog's Run button disables with an upgrade CTA for non-Pro users.
   * (Backend enforcement still lives in `standardAccessPolicy` — this
   * flag is presentation only.)
   */
  requiresPro?: boolean;
  /**
   * If true, this tool MUTATES user data (resume content, profile fields).
   * The AI coach's ToolCallCard renders a preview + Apply button rather
   * than auto-applying — unless the user has opted into auto-apply via
   * `accountPreferences.extension_settings.ai.autoApplyChanges`.
   */
  mutates?: boolean;
  /**
   * JSON Schema describing the arguments the LLM must pass when calling
   * this tool via function calling. Optional because tools that only run
   * from the standalone /tools/* pages (e.g. multi-step wizards) don't
   * need it. When present, the AI coach exposes the tool to the model.
   */
  parameters?: ToolParametersSchema;
  /**
   * Run the tool. Implementations call the existing API endpoint and
   * map the response into NormalizedToolRunResult.
   */
  run(ctx: ToolRunContext): Promise<NormalizedToolRunResult>;
}
