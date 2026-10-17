/**
 * Transcript search — recruiter-facing search across video resume / async
 * interview transcripts.
 *
 * Closes audit gap #6 (Pricing.tsx claimed "Video resume transcript search"
 * but the existing /api/search route only matched titles + descriptions; the
 * transcription columns on studioRecordings + studioAsyncResponses were
 * captured but never queried).
 *
 * Auth: any signed-in user can search; recruiter-only gating is a UX choice
 * surfaced in the frontend.
 */
import { Hono } from "hono";
import { sql, desc, eq } from "drizzle-orm";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { clampLimit } from "../utils/pagination.js";

export const transcriptSearchRoutes = new Hono<AppEnv>();

interface TranscriptHit {
  source: "recording" | "async_response";
  id: string;
  userId: string | null;
  candidateId: string | null;
  videoUrl: string | null;
  excerpt: string;
  matchCount: number;
  durationMs: number | null;
  createdAt: string;
}

function makeExcerpt(transcription: string, query: string, radius = 80): { excerpt: string; matchCount: number } {
  const lower = transcription.toLowerCase();
  const q = query.toLowerCase();
  let matchCount = 0;
  let pos = lower.indexOf(q);
  if (pos === -1) {
    return { excerpt: transcription.slice(0, radius * 2), matchCount: 0 };
  }
  // Walk and count.
  while (pos !== -1) {
    matchCount += 1;
    pos = lower.indexOf(q, pos + q.length);
  }
  // First-match excerpt with surrounding context.
  const first = lower.indexOf(q);
  const start = Math.max(0, first - radius);
  const end = Math.min(transcription.length, first + q.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < transcription.length ? "…" : "";
  return { excerpt: prefix + transcription.slice(start, end) + suffix, matchCount };
}

transcriptSearchRoutes.get("/", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) {
    return c.json(error("VALIDATION_ERROR", "Query must be at least 2 characters"), 400);
  }
  const limit = clampLimit(c.req.query("limit"), 20, 50);

  const db = getDb();
  const pattern = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;

  // Webcam / studio recordings (user-uploaded video resumes).
  const recordings = await db
    .select({
      id: schema.studioRecordings.id,
      userId: schema.studioRecordings.userId,
      videoUrl: schema.studioRecordings.videoUrl,
      transcription: schema.studioRecordings.transcription,
      durationMs: schema.studioRecordings.durationMs,
      createdAt: schema.studioRecordings.createdAt,
    })
    .from(schema.studioRecordings)
    .where(sql`${schema.studioRecordings.transcription} ILIKE ${pattern}`)
    .orderBy(desc(schema.studioRecordings.createdAt))
    .limit(limit);

  // Async one-way interview responses (recruiter screened candidates).
  const asyncResponses = await db
    .select({
      id: schema.studioAsyncResponses.id,
      candidateId: schema.studioAsyncResponses.candidateId,
      videoUrl: schema.studioAsyncResponses.videoUrl,
      transcription: schema.studioAsyncResponses.transcription,
      durationMs: schema.studioAsyncResponses.durationMs,
      createdAt: schema.studioAsyncResponses.createdAt,
    })
    .from(schema.studioAsyncResponses)
    .where(sql`${schema.studioAsyncResponses.transcription} ILIKE ${pattern}`)
    .orderBy(desc(schema.studioAsyncResponses.createdAt))
    .limit(limit);

  const hits: TranscriptHit[] = [];
  for (const r of recordings) {
    if (!r.transcription) continue;
    const { excerpt, matchCount } = makeExcerpt(r.transcription, q);
    hits.push({
      source: "recording",
      id: r.id,
      userId: r.userId ?? null,
      candidateId: null,
      videoUrl: r.videoUrl,
      excerpt,
      matchCount,
      durationMs: r.durationMs,
      createdAt: r.createdAt.toISOString(),
    });
  }
  for (const a of asyncResponses) {
    if (!a.transcription) continue;
    const { excerpt, matchCount } = makeExcerpt(a.transcription, q);
    hits.push({
      source: "async_response",
      id: a.id,
      userId: null,
      candidateId: a.candidateId,
      videoUrl: a.videoUrl,
      excerpt,
      matchCount,
      durationMs: a.durationMs,
      createdAt: a.createdAt.toISOString(),
    });
  }

  hits.sort((a, b) => b.matchCount - a.matchCount || b.createdAt.localeCompare(a.createdAt));

  return c.json(success({ query: q, hits, count: hits.length }), 200);
});
