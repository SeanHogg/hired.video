/**
 * Ports the résumé use cases depend on (queries.ts, commands.ts, create/*).
 * Production wiring lives in deps.ts; tests build their own.
 *
 * Use cases return plain domain data and throw DomainError
 * (domains/errors.ts); the route layer maps both onto the envelope.
 */
import type { IResumeRepository } from "../../repositories/index.js";

/** AI-backed resume parser. Pure wrapper so tests can return deterministic
 *  content without firing LLM calls. */
export interface ResumeParserPort {
  parseRawText(text: string): Promise<Record<string, unknown>>;
  tryParseJsonResume(text: string): Record<string, unknown> | null;
  normalizeJsonResume(content: unknown): Record<string, unknown>;
}

/** Diff recomputation port — the live implementation walks the parent/
 *  child relationship via the repository. */
export interface DiffRecomputePort {
  refresh(repo: IResumeRepository, userId: string, resumeId: string): Promise<void>;
}

/** Reads the owner's Settings → Privacy → promoteWithoutAuth so the
 *  public résumé page can skip the anonymous AuthOverlay. */
export interface OwnerPromotionPort {
  isPromotedWithoutAuth(ownerId: string): Promise<boolean>;
}

export interface ResumeDeps {
  /** The ONLY data-access point for resume tables. */
  repo: IResumeRepository;
  parser: ResumeParserPort;
  diff: DiffRecomputePort;
  now: () => Date;
  /** Owner promotion flag reader (#887). Optional for tests. */
  ownerFlags?: OwnerPromotionPort;
  /** Runs telemetry off the response path (Workers `waitUntil`). When absent
   *  the task still runs detached — it just isn't kept alive past the
   *  response. Tests inject one to await the work deterministically. */
  runDetached?: (task: Promise<void>) => void;
}

/** Per-request context the route strips out of Hono's c. */
export interface ResumeRequestContext {
  viewerId: string | null;
  ipHash: string | null;
  ipCountry: string | null;
  referrer: string | null;
  userAgent: string | null;
}
