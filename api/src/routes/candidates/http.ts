// http.ts — the HTTP adapter helpers shared by every /api/recruit and
// /api/recruit/pitch-decks sub-router (routes/candidates/*,
// routes/pitch-decks/*): JSON-body validation with the surface's exact
// 400 envelope, and use-case → envelope rendering.

import type { Context } from "hono";
import type { z } from "zod";
import { error } from "../../types/index.js";
import { toHandlerResult } from "../../handlers/shared.js";
import { sendHandlerResult } from "../helpers/routerHelpers.js";

/** Parse + validate the JSON body; a bad/missing body renders
 *  `400 VALIDATION_ERROR <message>` with the flattened zod issues. */
export async function parseJsonBody<S extends z.ZodTypeAny>(
  c: Context,
  schema: S,
  message = "Invalid payload",
): Promise<{ data: z.output<S> } | { response: Response }> {
  const body = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { response: c.json(error("VALIDATION_ERROR", message, parsed.error.flatten()), 400) };
  }
  return { data: parsed.data };
}

/** Await a use case: data → `success(data)` at `status`, DomainError → its envelope. */
export async function respond(c: Context, run: Promise<unknown>, status = 200): Promise<Response> {
  return sendHandlerResult(c, await toHandlerResult(run, status));
}
