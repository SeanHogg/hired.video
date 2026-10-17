/** Career 360 plan wire schema — lenient LLM ingest + horizon normalisation. */

import { z } from "zod";
import { defineLenientIngest } from "../adapters/llm-client.js";
import { GapSchema, TargetRubricSchema } from "../../../../shared/career360-types.js";

/** The four legal horizon buckets the UI groups roadmap steps under.
 *  Matches the strict enum on `RoadmapStepSchema.horizon`. */
const HORIZON_BUCKETS = ["30d", "60d", "90d", "180d"] as const;
type Horizon = (typeof HORIZON_BUCKETS)[number];

/** Lenient ingest shape for the LLM's plan response. Free-tier models
 *  (qwen, gemma) drift on later roadmap items and emit horizons like
 *  "6m", "1y", "4w", or "30 days" — values the strict
 *  `RoadmapStepSchema` enum rejects, which previously took down a whole
 *  multi-model fallback chain (per the AI vendor's analysis on
 *  2026-05-10). Accepting `string` here lets the call succeed; the
 *  service then maps each horizon onto a legal bucket via
 *  `normalizeHorizon` before constructing the canonical
 *  `RoadmapStepSchema`-shaped roadmap. */
const LenientRoadmapStepSchema = z.object({
  id: z.string().min(1),
  horizon: z.string().min(1),
  title: z.string().min(1).max(200),
  detail: z.string().max(600),
  closesGapIds: z.array(z.string()).default([]),
});

const LenientPlanResponseSchema = z.object({
  rubric: TargetRubricSchema,
  gaps: z.array(GapSchema).min(1).max(20),
  roadmap: z.array(LenientRoadmapStepSchema).min(1).max(20),
});

/** Map any LLM-emitted horizon string onto the nearest legal bucket.
 *
 *  Accepts: canonical `30d`/`60d`/`90d`/`180d` (passes through), plus
 *  any `\d+\s*(d|w|m|y|day|week|month|year)s?` form including
 *  `"6 months"`, `"4w"`, `"1y"`, `"30 days"`. Anything unparseable
 *  defaults to `"30d"` — the immediacy bucket is the safest fallback
 *  since the seeker can always defer a "do this in 30 days" item, but
 *  burying real near-term work under a 6-month label hides it. */
export function normalizeHorizon(raw: string): Horizon {
  const s = raw.trim().toLowerCase();
  if ((HORIZON_BUCKETS as readonly string[]).includes(s)) return s as Horizon;
  const match = s.match(/(\d+)\s*(d|w|m|y|day|week|month|year)/);
  if (!match) return "30d";
  const n = Number.parseInt(match[1], 10);
  if (!Number.isFinite(n) || n <= 0) return "30d";
  const unit = match[2][0]; // d / w / m / y
  const days =
    unit === "w" ? n * 7
    : unit === "m" ? n * 30
    : unit === "y" ? n * 365
    : n;
  if (days <= 45) return "30d";
  if (days <= 75) return "60d";
  if (days <= 135) return "90d";
  return "180d";
}

/** Pairs the lenient wire schema with `normalizeHorizon` so the LLM
 *  client can: (1) hand the gateway a strict `json_schema` derived
 *  from the lenient shape (vendor-side conformance retry on capable
 *  providers), (2) Zod-validate the wire response, (3) coerce the
 *  free-form horizon string onto the canonical `RoadmapStep` enum
 *  before returning to the service. Single source for "what we accept
 *  on the wire vs. what the rest of the app sees". */
export const Career360PlanIngest = defineLenientIngest({
  name: "Career360Plan",
  ingest: LenientPlanResponseSchema,
  coerce: (wire) => ({
    rubric: wire.rubric,
    gaps: wire.gaps,
    roadmap: wire.roadmap.map((step) => ({
      ...step,
      horizon: normalizeHorizon(step.horizon),
    })),
  }),
});
