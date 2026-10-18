import { logger } from "../../lib/logger.js";
import { LoginEventsRepository, type DbLike } from "../../repositories/loginEventsRepository.js";
import type { AuthDeps } from "./authPorts.js";

// ---------------------------------------------------------------------------
// recordLoginEvent — fire-and-forget insert into login_events. Awaited so
// the row lands before the response (admin tooling sees it immediately),
// but wrapped in try/catch so a telemetry failure never blocks the auth
// flow itself. kind = 'register' | 'login' | 'oauth_login' | 'magic_link';
// failureReason is short machine-readable code (e.g. 'invalid_password').
// ---------------------------------------------------------------------------

export interface LoginEventInput {
  userId: string | null;
  email: string | null;
  kind: "register" | "login" | "oauth_login" | "magic_link";
  provider: string | null;
  success: boolean;
  failureReason?: string | null;
}

export interface LoginEventClient {
  clientIp: string | null;
  userAgent: string | null;
}

/** The ONE login_events writer — callers without full AuthDeps (OAuth)
 *  pass a db handle + the request's client context directly. */
export async function writeLoginEvent(db: DbLike, client: LoginEventClient, ev: LoginEventInput): Promise<void> {
  try {
    await new LoginEventsRepository(db).insert({
      userId: ev.userId,
      email: ev.email,
      kind: ev.kind,
      provider: ev.provider,
      ipAddress: client.clientIp,
      userAgent: client.userAgent,
      success: ev.success,
      failureReason: ev.failureReason ?? null,
    });
  } catch (err) {
    logger.error("[loginEvent] insert failed", err);
  }
}

export async function recordLoginEvent(deps: AuthDeps, ev: LoginEventInput): Promise<void> {
  await writeLoginEvent(deps.db, deps, ev);
}
