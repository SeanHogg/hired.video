/**
 * Config snapshot — records WHICH capabilities are configured on the live
 * Worker, keyed to the deployed release, as an `activity_logs` row
 * (`action = 'config_snapshot'`). Run from the 5-minute cron, so it lands even
 * with no traffic.
 *
 * Deduped: a row is written only when (release, capability report) changes,
 * or every 30 days to outlive the 90-day activity_logs retention. Missing
 * capabilities also go to the structured log, so Workers Logs shows them on
 * the deploy that lost them.
 */
import type { IAuditRepository } from "../../repositories/auditRepository.js";
import { getKvNamespace } from "../../utils/edge-cache.js";
import { getRelease } from "../../utils/release.js";
import { logger } from "../../lib/logger.js";
import { evaluateCapabilities, type CapabilityReport } from "./config-capabilities.js";

export const CONFIG_SNAPSHOT_ACTION = "config_snapshot";
const REFRESH_SECONDS = 30 * 24 * 60 * 60;

/** Per-isolate guard: one KV probe per isolate per report, not per tick. */
let lastRecordedKey: string | null = null;

/** FNV-1a — a stable, cheap fingerprint for the dedupe key (not security). */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export async function recordConfigSnapshot(
  audit: Pick<IAuditRepository, "insertActivity">,
  report: CapabilityReport = evaluateCapabilities(),
): Promise<boolean> {
  const release = getRelease();
  const releaseId = release?.id ?? "unversioned";
  const key = `obs:cfgsnap:${releaseId}:${fingerprint(JSON.stringify(report))}`;
  if (lastRecordedKey === key) return false;

  const kv = getKvNamespace();
  if (kv && (await kv.get(key))) {
    lastRecordedKey = key;
    return false;
  }

  const notReady = Object.entries(report).filter(([, s]) => !s.ready).map(([name]) => name);
  if (notReady.length > 0) {
    logger.warn("config capabilities not ready", { releaseId, notReady });
  }

  await audit.insertActivity({
    action: CONFIG_SNAPSHOT_ACTION,
    entityType: "worker_release",
    metadata: { release, capabilities: report, notReady },
  });
  await kv?.put(key, "1", { expirationTtl: REFRESH_SECONDS });
  lastRecordedKey = key;
  return true;
}

/** Test seam — resets the per-isolate guard. */
export function __resetConfigSnapshotGuard(): void {
  lastRecordedKey = null;
}
