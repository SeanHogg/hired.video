/**
 * Match-domain dependency port. Every side-effecting dependency (DB,
 * clock, LLM) flows in via `MatchDeps` so the handlers can be faked in
 * tests. Split out of match-handlers.ts (now a re-export facade).
 */
import {
  createLLMClient,
  hasAnyLLMProviderKey,
  type LLMClient,
  type LLMEnv,
} from "../../services/adapters/llm-client.js";
import { getDb } from "../../db/index.js";
import type { JwtPayload } from "../../types/index.js";

export type DbPort = any;

export interface MatchDeps {
  db: DbPort;
  now: () => Date;
  /** LLM port — inject the prod client in routes, a fake in tests. The
   *  prod client charges `tokenLedger` automatically on every call, so
   *  handlers don't need a separate usage recorder. */
  llm: LLMClient | null;
  /** Seam for the cache-write side effect (`saveMatchScore`), which the
   *  handler runs detached so it never blocks the scored response. Prod
   *  leaves this undefined → the default fire-and-forget (`void task()`).
   *  Tests inject a capturing variant so they can await the REAL insert
   *  instead of guessing the async depth with a setTimeout/setImmediate
   *  tick (which raced the onConflict write under CI load). Mirrors the
   *  people-ops event sink's `runDetached`. */
  runDetached?: (task: () => Promise<unknown>) => void;
}

/** Run a side effect detached from the response path. Defaults to true
 *  fire-and-forget; `deps.runDetached` lets tests capture the promise. */
export function detach(deps: MatchDeps, task: () => Promise<unknown>): void {
  (deps.runDetached ?? ((t) => void t()))(task);
}

/** Production wiring — live request DB, wall clock, and the metered LLM
 *  client when a provider key is configured. Match flows touch multiple use
 *  cases (analyze, tailor, roast, insights); each call site inside the
 *  handler picks its own useCase per `llm.callJson(...)`, and the client
 *  gates the budget and charges the ledger automatically. */
export function liveMatchDeps(env: LLMEnv | undefined, user: JwtPayload | null | undefined): MatchDeps {
  return {
    db: getDb(),
    now: () => new Date(),
    llm: hasAnyLLMProviderKey(env) ? createLLMClient(env, user) : null,
  };
}
