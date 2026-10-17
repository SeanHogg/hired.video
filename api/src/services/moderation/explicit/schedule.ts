/**
 * Fire-and-forget entry point for the home-wall gate: every writer that can
 * make a video public / put it on the wall / replace its render calls
 * `scheduleVideoScan(c, videoId)` after its write. The scan runs after the
 * response (waitUntil) — the video simply isn't on the wall until it passes.
 */
import type { Context } from "hono";
import { createExplicitScanDeps, type ExplicitScanEnv } from "./deps.js";
import { evaluateVideoForPublic } from "./videoScan.js";
import { logger } from "../../../lib/logger.js";

function runInBackground(c: Context, task: Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    // No ExecutionContext (node tests / local scripts): let it run detached.
    void task;
  }
}

export function scheduleVideoScan(c: Context, videoId: string | null | undefined): void {
  if (!videoId) return;
  const deps = createExplicitScanDeps(c.env as ExplicitScanEnv | undefined);
  runInBackground(
    c,
    evaluateVideoForPublic(videoId, deps).catch((err) => {
      logger.error("[explicit-scan] video scan failed", { videoId, error: err });
    }),
  );
}
