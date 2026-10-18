/**
 * LoginEventsRepository — the append-only `login_events` telemetry log
 * (every register / login / OAuth / magic-link attempt). Writers are the
 * auth services; the SuperAdmin security views read it via
 * admin/adminSecurityRepository.
 *
 * Zero business logic — a typed Drizzle wrapper taking a `db` handle.
 */

import { schema } from "../db/index.js";

const { loginEvents } = schema;

export type DbLike = any;

export interface LoginEventInsert {
  userId: string | null;
  email: string | null;
  kind: "register" | "login" | "oauth_login" | "magic_link";
  provider: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  failureReason: string | null;
}

export class LoginEventsRepository {
  constructor(private readonly db: DbLike) {}

  async insert(row: LoginEventInsert): Promise<void> {
    await this.db.insert(loginEvents).values(row as any);
  }
}
