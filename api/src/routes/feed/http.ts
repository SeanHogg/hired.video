/**
 * Shared HTTP adapters for the /api/feed sub-routers: viewer extraction,
 * lenient JSON body parsing, waitUntil binding, and DomainError → envelope
 * rendering (same `success` / `error` envelopes the routes always returned).
 */

import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { isDomainError } from "../../domains/errors.js";
import { isRecruiterLike } from "../../services/feed/feedPostPolicy.js";
import type { FeedViewer, WaitUntil } from "../../services/feed/feedPostsService.js";

export type FeedContext = Context<AppEnv>;

/** The current viewer (anonymous → empty id) + their recruiter-visibility tier. */
export function viewerOf(c: FeedContext): FeedViewer {
  return { userId: c.var.userId ?? "", isRecruiter: isRecruiterLike(c.var.user) };
}

/** Request body as a plain record; malformed / missing JSON → `{}`. */
export async function readBody(c: FeedContext): Promise<Record<string, unknown>> {
  return (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
}

/** Lazily bound `executionCtx.waitUntil` — the context is only touched when
 *  a fire-and-forget task is actually scheduled. */
export function waitUntilOf(c: FeedContext): WaitUntil {
  return (promise) => c.executionCtx?.waitUntil(promise);
}

/** A thrown DomainError → the `error(code, message, details)` envelope at
 *  its status; anything else propagates to the global error handler. */
export function renderDomainError(c: FeedContext, err: unknown): Response {
  if (isDomainError(err)) {
    return c.json(error(err.code, err.message, err.details), err.status as ContentfulStatusCode);
  }
  throw err;
}

/** Await a use case → `success(data)` at `status`; a DomainError → its
 *  error envelope (see renderDomainError). */
export async function respond<T>(
  c: FeedContext,
  run: Promise<T>,
  status: ContentfulStatusCode = 200,
): Promise<Response> {
  try {
    return c.json(success(await run), status);
  } catch (err) {
    return renderDomainError(c, err);
  }
}
