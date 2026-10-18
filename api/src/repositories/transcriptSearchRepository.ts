/**
 * TranscriptSearchRepository — ILIKE reads over the two transcript-bearing
 * tables: studio recordings (user-uploaded video résumés) and async one-way
 * interview responses (recruiter-screened candidates).
 */
import { desc, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { studioRecordings, studioAsyncResponses } = schema;

export interface RecordingTranscriptRow {
  id: string;
  userId: string | null;
  videoUrl: string | null;
  transcription: string | null;
  durationMs: number | null;
  createdAt: Date;
}

export interface AsyncResponseTranscriptRow {
  id: string;
  candidateId: string | null;
  videoUrl: string | null;
  transcription: string | null;
  durationMs: number | null;
  createdAt: Date;
}

/** Escape LIKE wildcards so the user's query matches literally. */
function containsPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

export async function searchRecordingTranscripts(query: string, limit: number): Promise<RecordingTranscriptRow[]> {
  const db = getDb();
  return db
    .select({
      id: studioRecordings.id,
      userId: studioRecordings.userId,
      videoUrl: studioRecordings.videoUrl,
      transcription: studioRecordings.transcription,
      durationMs: studioRecordings.durationMs,
      createdAt: studioRecordings.createdAt,
    })
    .from(studioRecordings)
    .where(sql`${studioRecordings.transcription} ILIKE ${containsPattern(query)}`)
    .orderBy(desc(studioRecordings.createdAt))
    .limit(limit) as Promise<RecordingTranscriptRow[]>;
}

export async function searchAsyncResponseTranscripts(query: string, limit: number): Promise<AsyncResponseTranscriptRow[]> {
  const db = getDb();
  return db
    .select({
      id: studioAsyncResponses.id,
      candidateId: studioAsyncResponses.candidateId,
      videoUrl: studioAsyncResponses.videoUrl,
      transcription: studioAsyncResponses.transcription,
      durationMs: studioAsyncResponses.durationMs,
      createdAt: studioAsyncResponses.createdAt,
    })
    .from(studioAsyncResponses)
    .where(sql`${studioAsyncResponses.transcription} ILIKE ${containsPattern(query)}`)
    .orderBy(desc(studioAsyncResponses.createdAt))
    .limit(limit) as Promise<AsyncResponseTranscriptRow[]>;
}
