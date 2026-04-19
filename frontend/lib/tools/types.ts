// Generalized tool abstraction. A Tool can take one or more entity inputs
// (resume, job, video, template, company) and optionally free-form text
// (e.g. a pasted job description). Context menus filter the registry by
// which entity they live on; the dialog collects any remaining inputs;
// the history panel shows runs that reference that entity.

import type { LucideIcon } from "lucide-react";

export type ToolEntityType = "resume" | "job" | "video" | "template" | "company";

/** Entity references passed to a tool at run time. */
export interface ToolRunContext {
  resumeId?: string;
  resumeText?: string;
  jobId?: string;
  jobDescription?: string;
  videoId?: string;
  templateId?: string;
  companyId?: string;
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
  raw?: unknown;
}

export interface ToolDefinition {
  /** Stable identifier persisted to tool_runs.tool_id. */
  id: string;
  /** Short label shown in menus + headers. */
  label: string;
  /** One-liner description shown in the dialog header. */
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
   * Run the tool. Implementations call the existing API endpoint and
   * map the response into NormalizedToolRunResult.
   */
  run(ctx: ToolRunContext): Promise<NormalizedToolRunResult>;
}
