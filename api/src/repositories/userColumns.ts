/**
 * `users` column projections (SSoT).
 *
 * `select().from(users)` returns credential material — `password_hash`,
 * `mfa_secret`, `session_version` — plus signup forensics (`signup_ip`,
 * `signup_user_agent`). Every read whose row can reach a client (directly
 * or via a spread into a DTO) selects `publicUserColumns` instead, so a
 * secret can never be serialized by accident. Only the auth flows that
 * genuinely verify credentials (login, password change, MFA) read the full
 * row, through the auth/users repositories.
 */
import { getTableColumns } from "drizzle-orm";
import { schema } from "../db/index.js";

const { users } = schema;

const {
  passwordHash: _passwordHash,
  mfaSecret: _mfaSecret,
  sessionVersion: _sessionVersion,
  signupIp: _signupIp,
  signupUserAgent: _signupUserAgent,
  ...nonSecretColumns
} = getTableColumns(users);

/** Every `users` column except credentials + signup forensics. */
export const publicUserColumns = nonSecretColumns;

export type PublicUserRow = Omit<
  typeof users.$inferSelect,
  "passwordHash" | "mfaSecret" | "sessionVersion" | "signupIp" | "signupUserAgent"
>;

/** The SQL names that must never appear in a client-reachable users read. */
export const USER_SECRET_SQL_COLUMNS = [
  "password_hash",
  "mfa_secret",
  "session_version",
  "signup_ip",
  "signup_user_agent",
] as const;
