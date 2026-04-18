// Resume-tool abstraction shared between the context-menu dialog, the
// history panel, and the full-page tool routes. A ResumeToolDefinition
// describes one tool: its metadata, how to run it against a resume, and
// how to normalise the response into a common ToolRunResult shape that
// the generic result panel + history chart both understand.

import type { LucideIcon } from "lucide-react";

// ── Normalised result shape ─────────────────────────────────────────────────
// Per-tool responses are mapped into this shape so ToolRunResultPanel and
// the history chart don't need to know about every individual tool. Any
// field is optional; tools populate what they have.
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
  // Preserve the full tool-specific payload so historical runs can be
  // re-hydrated into a richer view later without data loss.
  raw?: unknown;
}

export interface ResumeToolRunInput {
  resumeId: string;
  resumeText: string;
  jobDescription?: string;
}

export interface ResumeToolDefinition {
  /** Stable identifier persisted to tool_runs.tool_id. */
  id: string;
  /** Short label shown in menu + headers. */
  label: string;
  /** One-liner shown in the dialog header. */
  description: string;
  icon: LucideIcon;
  /** Accent colour class (Tailwind bg token) for the header icon tile. */
  accentClassName?: string;
  /** Full-page route for users who want the standalone tool. */
  route: string;
  /** True if the tool needs a job description to be useful. */
  needsJobDescription?: boolean;
  /** True when the tool produces a comparable score we can chart. */
  producesScore?: boolean;
  /**
   * Run the tool against a resume. Implementations should call the existing
   * API endpoint and map the response into the normalised shape.
   */
  run(input: ResumeToolRunInput): Promise<NormalizedToolRunResult>;
}
