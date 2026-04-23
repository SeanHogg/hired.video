import { and, eq, isNull, desc, count } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { buildEmulationToken } from "../../utils/jwt.js";
import { auditLog, AUDIT_ACTIONS } from "../../utils/audit.js";

export const IMPERSONATION_TTL_SECONDS = 60 * 60; // 1 hour

// ── DI port ───────────────────────────────────────────────────────────────────
//
// Every side-effecting primitive — DB, clock, JWT signer, audit logger —
// flows through this port. Production wiring lives in `defaultDeps()`;
// tests pass a fake `db` (via buildFakeDb) + a fake token builder + a spy
// audit fn so the state machine can be exercised without a real Postgres,
// a real JWT secret, or writes to `admin_audit_log`.

export interface ImpersonationDeps {
  db: ReturnType<typeof getDb>;
  now: () => Date;
  buildToken: typeof buildEmulationToken;
  audit: typeof auditLog;
}

export function defaultDeps(): ImpersonationDeps {
  return {
    db: getDb(),
    now: () => new Date(),
    buildToken: buildEmulationToken,
    audit: auditLog,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StartImpersonationInput {
  adminId: string;
  targetUserId: string;
  reason: string;
  enableDebugger?: boolean;
}

export interface StartImpersonationResult {
  sessionId: string;
  token: string;
  user: { id: string; email: string; name: string | null };
  role: string;
  startedAt: Date;
  expiresAt: Date;
}

export interface SwitchRoleResult {
  sessionId: string;
  token: string;
  role: string;
  expiresAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetches the target user and validates impersonation eligibility. */
async function resolveImpersonationTarget(deps: ImpersonationDeps, targetUserId: string) {
  const [user] = await deps.db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      isSuperAdmin: schema.users.isSuperAdmin,
      isSuspended: schema.users.isSuspended,
    })
    .from(schema.users)
    .where(eq(schema.users.id, targetUserId))
    .limit(1);
  return user ?? null;
}

// ── Service functions ─────────────────────────────────────────────────────────

export async function startImpersonation(
  input: StartImpersonationInput,
  deps: ImpersonationDeps = defaultDeps(),
): Promise<
  | { ok: true; result: StartImpersonationResult }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "CONFLICT"; message: string }
> {
  const targetUser = await resolveImpersonationTarget(deps, input.targetUserId);

  if (!targetUser) return { ok: false, code: "NOT_FOUND", message: "Target user not found" };
  if (targetUser.isSuperAdmin) return { ok: false, code: "FORBIDDEN", message: "Cannot impersonate a SuperAdmin" };

  const [existingSession] = await deps.db
    .select({ id: schema.impersonationSessions.id })
    .from(schema.impersonationSessions)
    .where(and(eq(schema.impersonationSessions.superAdminId, input.adminId), isNull(schema.impersonationSessions.endedAt)))
    .limit(1);

  if (existingSession) {
    return { ok: false, code: "CONFLICT", message: "You already have an active impersonation session. End it before starting a new one." };
  }

  const expiresAt = new Date(deps.now().getTime() + IMPERSONATION_TTL_SECONDS * 1000);

  const { token, jti } = await deps.buildToken({
    targetUserId: targetUser.id,
    targetEmail: targetUser.email,
    targetRole: targetUser.role,
    adminId: input.adminId,
    expiresAt,
  });

  const [session] = await deps.db
    .insert(schema.impersonationSessions)
    .values({
      superAdminId: input.adminId,
      targetUserId: targetUser.id,
      tokenId: jti,
      reason: input.reason.trim(),
      debuggerEnabled: input.enableDebugger ?? false,
      expiresAt,
    } as any)
    .returning();

  await deps.audit({
    actorId: input.adminId,
    action: AUDIT_ACTIONS.IMPERSONATION_STARTED,
    targetType: "user",
    targetId: targetUser.id,
    impersonationSessionId: session.id,
    metadata: { reason: input.reason.trim(), targetEmail: targetUser.email, enableDebugger: input.enableDebugger },
  });

  return {
    ok: true,
    result: {
      sessionId: session.id,
      token,
      user: { id: targetUser.id, email: targetUser.email, name: targetUser.name },
      role: targetUser.role,
      startedAt: session.startedAt,
      expiresAt,
    },
  };
}

export async function endImpersonation(
  adminId: string,
  sessionId: string,
  deps: ImpersonationDeps = defaultDeps(),
): Promise<
  | { ok: true; result: { sessionId: string; durationSeconds: number; endedAt: string } }
  | { ok: false; code: "NOT_FOUND" | "CONFLICT"; message: string }
> {
  const [session] = await deps.db
    .select()
    .from(schema.impersonationSessions)
    .where(and(eq(schema.impersonationSessions.id, sessionId), eq(schema.impersonationSessions.superAdminId, adminId)))
    .limit(1);

  if (!session) return { ok: false, code: "NOT_FOUND", message: "Session not found" };
  if (session.endedAt) return { ok: false, code: "CONFLICT", message: "Session already ended" };

  const now = deps.now();
  const durationSeconds = Math.round((now.getTime() - session.startedAt.getTime()) / 1000);

  await deps.db
    .update(schema.impersonationSessions)
    .set({ endedAt: now, endReason: "manual" } as any)
    .where(eq(schema.impersonationSessions.id, sessionId));

  await deps.audit({
    actorId: adminId,
    action: AUDIT_ACTIONS.IMPERSONATION_ENDED,
    targetType: "user",
    targetId: session.targetUserId,
    impersonationSessionId: session.id,
    metadata: { endReason: "manual", durationSeconds, writeBlockCount: session.writeBlockCount },
  });

  return { ok: true, result: { sessionId, durationSeconds, endedAt: now.toISOString() } };
}

export async function switchImpersonationRole(
  adminId: string,
  sessionId: string,
  newRole: string,
  deps: ImpersonationDeps = defaultDeps(),
): Promise<
  | { ok: true; result: SwitchRoleResult }
  | { ok: false; code: "NOT_FOUND"; message: string }
> {
  const [session] = await deps.db
    .select()
    .from(schema.impersonationSessions)
    .where(
      and(
        eq(schema.impersonationSessions.id, sessionId),
        eq(schema.impersonationSessions.superAdminId, adminId),
        isNull(schema.impersonationSessions.endedAt),
      ),
    )
    .limit(1);

  if (!session) return { ok: false, code: "NOT_FOUND", message: "Active session not found" };

  const [targetUser] = await deps.db
    .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, session.targetUserId))
    .limit(1);

  if (!targetUser) return { ok: false, code: "NOT_FOUND", message: "Target user not found" };

  await deps.db.insert(schema.impersonationRoleSwitches).values({
    sessionId: session.id,
    fromRole: targetUser.role,
    toRole: newRole,
  });

  const { token } = await deps.buildToken({
    targetUserId: targetUser.id,
    targetEmail: targetUser.email,
    targetRole: newRole,
    adminId,
    sessionId: session.id,
    expiresAt: session.expiresAt,
  });

  await deps.audit({
    actorId: adminId,
    action: AUDIT_ACTIONS.IMPERSONATION_PERSONA_SWITCHED,
    targetType: "user",
    targetId: targetUser.id,
    impersonationSessionId: session.id,
    metadata: { fromRole: targetUser.role, toRole: newRole },
  });

  return { ok: true, result: { sessionId, token, role: newRole, expiresAt: session.expiresAt.toISOString() } };
}

export async function getActiveSession(
  adminId: string,
  deps: ImpersonationDeps = defaultDeps(),
) {
  const [session] = await deps.db
    .select({
      id: schema.impersonationSessions.id,
      targetUserId: schema.impersonationSessions.targetUserId,
      startedAt: schema.impersonationSessions.startedAt,
      expiresAt: schema.impersonationSessions.expiresAt,
      debuggerEnabled: schema.impersonationSessions.debuggerEnabled,
    })
    .from(schema.impersonationSessions)
    .where(and(eq(schema.impersonationSessions.superAdminId, adminId), isNull(schema.impersonationSessions.endedAt)))
    .limit(1);

  if (!session) return null;

  const [targetUser] = await deps.db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, session.targetUserId))
    .limit(1);

  return { ...session, targetUser: targetUser ?? null };
}

export async function listSessions(
  page: number,
  limit: number,
  deps: ImpersonationDeps = defaultDeps(),
) {
  const offset = (page - 1) * limit;

  const sessions = await deps.db
    .select({
      id: schema.impersonationSessions.id,
      superAdminId: schema.impersonationSessions.superAdminId,
      targetUserId: schema.impersonationSessions.targetUserId,
      reason: schema.impersonationSessions.reason,
      startedAt: schema.impersonationSessions.startedAt,
      endedAt: schema.impersonationSessions.endedAt,
      expiresAt: schema.impersonationSessions.expiresAt,
      endReason: schema.impersonationSessions.endReason,
      writeBlockCount: schema.impersonationSessions.writeBlockCount,
    })
    .from(schema.impersonationSessions)
    .orderBy(desc(schema.impersonationSessions.startedAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await deps.db.select({ total: count() }).from(schema.impersonationSessions);
  return { sessions, total, page, limit };
}

export async function getSessionDetail(
  sessionId: string,
  deps: ImpersonationDeps = defaultDeps(),
) {
  const [session] = await deps.db
    .select()
    .from(schema.impersonationSessions)
    .where(eq(schema.impersonationSessions.id, sessionId))
    .limit(1);

  if (!session) return null;

  const [roleSwitches, targetUser] = await Promise.all([
    deps.db
      .select()
      .from(schema.impersonationRoleSwitches)
      .where(eq(schema.impersonationRoleSwitches.sessionId, sessionId))
      .orderBy(schema.impersonationRoleSwitches.switchedAt),
    deps.db
      .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, session.targetUserId))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  return { session, roleSwitches, targetUser };
}
