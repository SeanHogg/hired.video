/**
 * Assessment norms recompute worker.
 *
 * Scans every completed `assessment_runs` row, collects raw dimension
 * scores per (assessment_kind, dimension), recomputes the 101-entry
 * percentile curve via `computePercentileCurve`, and upserts the row
 * in `assessment_dimension_norms`. Worker runs daily; the per-(kind,
 * dimension) curve only changes meaningfully as the population grows,
 * so a 24h cadence is fine.
 *
 * Sample-size floor: curves are dropped (not cached) when fewer than
 * 25 completed runs back a dimension. Adverse-impact analysis +
 * defensible scoring need a baseline — better to surface "no calibrated
 * percentile yet" than a misleading one.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { computePercentileCurve, invalidateNormCache } from "../services/assessments/norms.js";
import type { WorkerDefinition, WorkerRunContext } from "./types.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface RunRow {
  assessmentKind: string;
  scores: { scores: Record<string, number> } | null;
}

async function run(ctx: WorkerRunContext): Promise<void> {
  const db = getDb();
  const runsTable = (schema as any).assessmentRuns;
  const normsTable = (schema as any).assessmentDimensionNorms;
  if (!runsTable || !normsTable) {
    ctx.recordFailure("schema-missing", "assessment_runs or assessment_dimension_norms not found");
    return;
  }

  // Pull every completed run. Bounded to 50k as a safety net — anything
  // bigger should split per kind, but we're nowhere near that yet.
  const rows = (await db
    .select({
      assessmentKind: runsTable.assessmentKind,
      scores: runsTable.scores,
    })
    .from(runsTable)
    .where(eq(runsTable.status, "completed"))
    .limit(50_000)
    .catch(() => [] as RunRow[])) as RunRow[];

  ctx.recordScanned(rows.length);

  // Bucket raw dimension scores per (kind, dimension).
  const buckets = new Map<string, { kind: string; dimension: string; scores: number[] }>();
  for (const row of rows) {
    const kind = row.assessmentKind;
    const scoreMap = row.scores?.scores ?? {};
    for (const [dim, raw] of Object.entries(scoreMap)) {
      const key = `${kind}::${dim}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { kind, dimension: dim, scores: [] };
        buckets.set(key, bucket);
      }
      if (typeof raw === "number" && Number.isFinite(raw)) bucket.scores.push(raw);
    }
  }

  for (const { kind, dimension, scores } of buckets.values()) {
    const curve = computePercentileCurve(scores);
    if (!curve) {
      ctx.recordSkipped();
      continue;
    }
    try {
      // Drizzle upsert via raw SQL on the unique (kind, dimension)
      // index defined in migration 0120.
      await db.execute(sql`
        INSERT INTO assessment_dimension_norms (assessment_kind, dimension, percentile_curve, sample_size)
        VALUES (${kind}, ${dimension}, ${JSON.stringify(curve)}::jsonb, ${scores.length})
        ON CONFLICT (assessment_kind, dimension) DO UPDATE SET
          percentile_curve = EXCLUDED.percentile_curve,
          sample_size = EXCLUDED.sample_size,
          recomputed_at = now(),
          updated_at = now();
      `);
      invalidateNormCache(kind, dimension);
      ctx.recordChanged();
      ctx.recordSample({ kind, dimension, sampleSize: scores.length });
    } catch (err) {
      ctx.recordFailure(`${kind}::${dimension}`, err instanceof Error ? err.message : String(err));
    }
  }
}

export const assessmentNormsWorker: WorkerDefinition = {
  name: "assessment-norms-recompute",
  displayName: "Assessment Norms Recompute",
  description:
    "Scans completed predictive-assessment runs, computes percentile curves per (kind, dimension), and upserts the cache the /complete endpoint reads against for calibrated percentile bands. Cadence: 24h.",
  cadenceMs: ONE_DAY_MS,
  batchSize: 1, // not a row-based batch — one full sweep per tick
  run,
};
