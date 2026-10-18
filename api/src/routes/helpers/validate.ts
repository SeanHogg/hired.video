/**
 * `validateJson(schema)` — the ONE request-body validator for route handlers
 * (the in-house equivalent of @hono/zod-validator, which isn't a dependency).
 *
 *   router.post("/", validateJson(CreateSchema), async (c) => {
 *     const body = c.req.valid("json"); // typed z.output<typeof CreateSchema>
 *   });
 *
 * An unreadable / empty body parses as `{}` (or `emptyBody`), exactly like the
 * hand-rolled `Schema.safeParse(await c.req.json().catch(() => ({})))` it
 * replaces. On failure it answers 400 with the standard `error()` envelope —
 * `VALIDATION_ERROR` / "Invalid request" + `err.flatten()` details unless the
 * endpoint passes its own `invalid` hook (to keep its historical message).
 * The hook returns an envelope body (sent as 400) or a ready Response.
 */
import type { Context, Env, MiddlewareHandler } from "hono";
import type { ZodError, ZodType, input, output } from "zod";
import { error } from "../../types/index.js";

export type InvalidBodyHook = (err: ZodError, c: Context) => Response | object;

const defaultInvalid: InvalidBodyHook = (e) => error("VALIDATION_ERROR", "Invalid request", e.flatten());

export function validateJson<T extends ZodType, E extends Env = Env, P extends string = string>(
  schema: T,
  invalid: InvalidBodyHook = defaultInvalid,
  options: { emptyBody?: unknown } = {},
): MiddlewareHandler<E, P, { in: { json: input<T> }; out: { json: output<T> } }> {
  const emptyBody = "emptyBody" in options ? options.emptyBody : {};
  return async (c, next) => {
    const raw: unknown = await c.req.json().catch(() => emptyBody);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const out = invalid(parsed.error, c as unknown as Context);
      return out instanceof Response ? out : c.json(out as never, 400);
    }
    c.req.addValidatedData("json", parsed.data as object);
    await next();
  };
}
