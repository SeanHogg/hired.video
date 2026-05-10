/**
 * Sync-batch digest — generates a single comprehensive recap of the
 * messages persisted by one sync run. Called at the tail of the sync
 * orchestrator so the digest text lands on the same `email_sync_runs`
 * row the run wrote.
 *
 * Cost-bounded: we only digest up to N messages per run, prefer the
 * job-related ones, and skip the call entirely when nothing useful
 * synced.
 */

import type { LLMClient } from "../adapters/llm-client.js";
import type { ExternalEmailMessageRow } from "../../repositories/externalEmailMessagesRepository.js";

const MAX_DIGEST_MESSAGES = 30;
const JOB_RELATED = new Set([
  "job_opportunity",
  "application_status",
  "recruiter_outreach",
  "interview_invite",
  "offer",
  "rejection",
]);

const DIGEST_PROMPT = `You write a brief recap of new emails synced into a job-seeker's inbox.
Constraints:
- 2-4 short sentences total.
- Lead with the most actionable items (interviews, offers, applications moving forward).
- Group by category if useful but don't list every email — synthesise.
- Plain text. No markdown headers, no bullet lists.
- If nothing job-relevant synced, say so in one sentence.`;

function pickForDigest(messages: ExternalEmailMessageRow[]): ExternalEmailMessageRow[] {
  const sorted = [...messages].sort((a, b) => {
    // Prefer high-score job-related messages.
    const aJob = JOB_RELATED.has(a.category ?? "") ? 1 : 0;
    const bJob = JOB_RELATED.has(b.category ?? "") ? 1 : 0;
    if (aJob !== bJob) return bJob - aJob;
    const aScore = a.score == null ? 0 : Number(a.score);
    const bScore = b.score == null ? 0 : Number(b.score);
    return bScore - aScore;
  });
  return sorted.slice(0, MAX_DIGEST_MESSAGES);
}

function describeForDigest(m: ExternalEmailMessageRow): string {
  const lines = [
    `From: ${m.fromName ?? m.fromEmail}`,
    `Subject: ${m.subject ?? ""}`,
  ];
  if (m.category) lines.push(`Category: ${m.category}`);
  if (m.summary) lines.push(`Summary: ${m.summary}`);
  else if (m.snippet) lines.push(`Snippet: ${m.snippet.slice(0, 200)}`);
  return lines.join("\n");
}

export interface DigestDeps { llm: LLMClient }

export async function buildSyncDigest(
  deps: DigestDeps,
  messages: ExternalEmailMessageRow[],
): Promise<string | null> {
  if (messages.length === 0) return null;
  const sample = pickForDigest(messages);
  const userMessage = sample.map(describeForDigest).join("\n---\n");
  try {
    const result = await deps.llm.callText("email_digest", {
      useCase: "email_digest",
      systemPrompt: DIGEST_PROMPT,
      userMessage:
        `Synced ${messages.length} emails. ${sample.length < messages.length ? `Top ${sample.length} shown.` : ""}\n\n${userMessage}`,
    });
    return (result.content ?? "").trim() || null;
  } catch (err) {
    console.error("[email-digest] LLM call failed:", err);
    return null;
  }
}
