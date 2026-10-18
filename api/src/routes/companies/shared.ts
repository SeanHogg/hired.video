/** Small HTTP-adapter helpers shared by the /api/companies sub-routers. */
import type { Context } from "hono";
import type { AppEnv } from "../../types/index.js";
import { failFromDomainError } from "../../handlers/shared.js";
import { DomainError } from "../../domains/errors.js";
import { sendHandlerResult } from "../helpers/routerHelpers.js";

export type CompaniesCtx = Context<AppEnv>;

/** Worker env as the flat string map the location / api-deps services take. */
export function envRecord(c: CompaniesCtx): Record<string, string | undefined> {
  return (c.env ?? {}) as Record<string, string | undefined>;
}

/** Await a use case; a thrown DomainError becomes the rendered `error()`
 *  envelope response, anything else propagates. */
export async function settle<T>(
  c: CompaniesCtx,
  run: Promise<T>,
): Promise<{ data: T } | { response: Response }> {
  try {
    return { data: await run };
  } catch (err) {
    if (err instanceof DomainError) return { response: sendHandlerResult(c, failFromDomainError(err)) };
    throw err;
  }
}
