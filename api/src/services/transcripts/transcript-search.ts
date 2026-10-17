/**
 * Transcript search — recruiter-facing search across video résumé / async
 * interview transcripts (audit gap #6: Pricing claimed "Video resume
 * transcript search" but /api/search only matched titles + descriptions).
 */
import {
  searchAsyncResponseTranscripts,
  searchRecordingTranscripts,
} from "../../repositories/transcriptSearchRepository.js";

export interface TranscriptHit {
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

export function makeExcerpt(transcription: string, query: string, radius = 80): { excerpt: string; matchCount: number } {
  const lower = transcription.toLowerCase();
  const q = query.toLowerCase();
  const first = lower.indexOf(q);
  if (first === -1) return { excerpt: transcription.slice(0, radius * 2), matchCount: 0 };
  let matchCount = 0;
  for (let pos = first; pos !== -1; pos = lower.indexOf(q, pos + q.length)) matchCount += 1;
  const start = Math.max(0, first - radius);
  const end = Math.min(transcription.length, first + q.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < transcription.length ? "…" : "";
  return { excerpt: prefix + transcription.slice(start, end) + suffix, matchCount };
}

export async function searchTranscripts(query: string, limit: number): Promise<TranscriptHit[]> {
  const [recordings, asyncResponses] = await Promise.all([
    searchRecordingTranscripts(query, limit),
    searchAsyncResponseTranscripts(query, limit),
  ]);

  const hits: TranscriptHit[] = [];
  for (const r of recordings) {
    if (!r.transcription) continue;
    hits.push({
      source: "recording",
      id: r.id,
      userId: r.userId ?? null,
      candidateId: null,
      videoUrl: r.videoUrl,
      ...makeExcerpt(r.transcription, query),
      durationMs: r.durationMs,
      createdAt: r.createdAt.toISOString(),
    });
  }
  for (const a of asyncResponses) {
    if (!a.transcription) continue;
    hits.push({
      source: "async_response",
      id: a.id,
      userId: null,
      candidateId: a.candidateId,
      videoUrl: a.videoUrl,
      ...makeExcerpt(a.transcription, query),
      durationMs: a.durationMs,
      createdAt: a.createdAt.toISOString(),
    });
  }

  hits.sort((a, b) => b.matchCount - a.matchCount || b.createdAt.localeCompare(a.createdAt));
  return hits;
}
