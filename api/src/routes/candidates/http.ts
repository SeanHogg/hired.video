// http.ts — the HTTP adapter helpers shared by every /api/recruit and
// /api/recruit/pitch-decks sub-router (routes/candidates/*,
// routes/pitch-decks/*): JSON-body validation with the surface's exact
// 400 envelope, and use-case → envelope rendering.

import type { Context } from "hono";
import type { ZodError } from "zod";
import { error } from "../../types/index.js";
import { toHandlerResult } from "../../handlers/shared.js";
import { sendHandlerResult } from "../helpers/routerHelpers.js";

/** `validateJson` hook: a bad/missing body renders
 *  `400 VALIDATION_ERROR <message>` with the flattened zod issues. */
export function invalidPayload(message = "Invalid payload") {
  return (err: ZodError) => error("VALIDATION_ERROR", message, err.flatten());
}

/** Await a use case: data → `success(data)` at `status`, DomainError → its envelope. */
export async function respond(c: Context, run: Promise<unknown>, status = 200): Promise<Response> {
  return sendHandlerResult(c, await toHandlerResult(run, status));
}
