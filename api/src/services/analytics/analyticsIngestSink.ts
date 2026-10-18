/**
 * analyticsIngestSink.ts — the write side behind `POST /api/analytics/events`.
 *
 * Every method is a BATCH write: the ingest dispatcher (event-kinds.ts)
 * groups a request's events by target table so one beacon costs a constant
 * number of statements (one INSERT per table, one owner lookup per owner
 * source, one session upsert + events insert per distinct usage visitor)
 * instead of one-or-two round-trips per event. Injectable so the dispatcher
 * is unit-testable without Postgres.
 */
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import type { ActivityLogInsert } from "../../repositories/auditRepository.js";
import type { TrackUsageInput } from "../../../../shared/usage.js";
import { UsageService, type UsageRequestContext } from "../usage/UsageService.js";
import { insertArtifactViewRows, type NewArtifactView } from "./artifactView.js";
import { lookupArtifactOwners, type ArtifactRef } from "./artifactOwners.js";

export interface AnalyticsIngestSink {
  /** Owners for many artifacts, keyed by artifactRefKey(kind, id). */
  lookupOwners(refs: readonly ArtifactRef[]): Promise<Map<string, string | null>>;
  /** ONE multi-row INSERT into activity_logs. */
  insertActivities(rows: readonly ActivityLogInsert[]): Promise<void>;
  /** ONE multi-row INSERT into artifact_views (views + listing views). */
  insertArtifactViews(rows: readonly NewArtifactView[]): Promise<void>;
  /** Consent-gated usage batches, merged per visitor (one upsert each). */
  recordUsage(batches: readonly TrackUsageInput[], ctx: UsageRequestContext): Promise<void>;
}

export function liveAnalyticsIngestSink(): AnalyticsIngestSink {
  return {
    lookupOwners: (refs) => lookupArtifactOwners(refs),
    insertActivities: (rows) => buildRepos(getDb()).audit.insertActivities(rows),
    insertArtifactViews: (rows) => insertArtifactViewRows(rows),
    async recordUsage(batches, ctx) {
      await new UsageService(buildRepos(getDb()).usageTracking).recordBatches(batches, ctx);
    },
  };
}
