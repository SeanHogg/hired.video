import { schema } from "../../db/index.js";
import { logger } from "../../lib/logger.js";
import type { AuthDeps } from "./authPorts.js";

const { loginEvents } = schema;

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

export async function recordLoginEvent(deps: AuthDeps, ev: LoginEventInput): Promise<void> {
  try {
    await deps.db.insert(loginEvents).values({
      userId: ev.userId,
      email: ev.email,
      kind: ev.kind,
      provider: ev.provider,
      ipAddress: deps.clientIp,
      userAgent: deps.userAgent,
      success: ev.success,
      failureReason: ev.failureReason ?? null,
    } as any);
  } catch (err) {
    logger.error("[loginEvent] insert failed", err);
  }
}
