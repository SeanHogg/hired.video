/**
 * Shared by the creators sub-routers: map a use-case result onto the
 * standard `success()` / `error()` envelopes with its status code.
 */
import type { Context } from "hono";
import { success, error } from "../../types/index.js";
import type { CreatorResult } from "../../services/creators/result.js";

export function sendResult<T>(c: Context, result: CreatorResult<T>): Response {
  if (result.ok === false) return c.json(error(result.code, result.message), result.status);
  return c.json(success(result.data), result.status);
}
