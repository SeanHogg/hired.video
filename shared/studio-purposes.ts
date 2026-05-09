/**
 * Studio Video Purposes — single source of truth for the storyboard
 * generator's `purpose` enum.
 *
 * Used in five places that must agree:
 *   • API: zod request validation + system-prompt builder branching
 *   • Frontend studio-service: VideoScriptSchema + StudioProjectSchema
 *     response validation, plus the StudioPurpose type alias
 *   • Frontend templates/catalog: per-template `purpose` fields
 *
 * `basic` is the generic single-scene path used by the "Basic" content
 * template (no brand framing). It's a real LLM purpose with its own
 * branch in `buildStudioSystemPrompt` — when the user picks Basic and
 * provides a prompt, the LLM produces a single-scene script. When the
 * user picks Basic with NO prompt, the route should short-circuit to
 * a blank single scene without calling the LLM.
 *
 * Adding a new purpose means editing this one record; the zod schemas
 * and TypeScript type derive from it automatically.
 */

export const STUDIO_PURPOSES = [
  "basic",
  "resume",
  "job_ad",
  "company_promo",
  "recruiter_brand",
  "product_launch",
  "personal_brand",
] as const;

export type StudioPurpose = (typeof STUDIO_PURPOSES)[number];
