/**
 * ExtensionTelemetryRepository — read-only SuperAdmin views over the Chrome
 * extension telemetry (`extension_sessions` / `extension_events`).
 */
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { extensionSessions, extensionEvents, users } = schema;

type DbHandle = ReturnType<typeof getDb>;
type ExtensionKind = "jobseeker" | "recruiter";

const total = sql<number>`count(*)::int`;

const sessionColumns = {
  id: extensionSessions.id,
  clientSessionId: extensionSessions.clientSessionId,
  userId: extensionSessions.userId,
  userEmail: users.email,
  userName: users.name,
  extension: extensionSessions.extension,
  version: extensionSessions.version,
  eventCount: extensionSessions.eventCount,
  errorCount: extensionSessions.errorCount,
  pickerCaptureCount: extensionSessions.pickerCaptureCount,
  startedAt: extensionSessions.startedAt,
  updatedAt: extensionSessions.updatedAt,
};

export interface SessionFilter {
  page: number;
  limit: number;
  extension?: ExtensionKind;
  hasErrors?: boolean;
  hasCaptures?: boolean;
}

export interface CaptureFilter {
  page: number;
  limit: number;
  host?: string;
  extension?: ExtensionKind;
}

export class ExtensionTelemetryRepository {
  constructor(private readonly db: DbHandle) {}

  static create(): ExtensionTelemetryRepository {
    return new ExtensionTelemetryRepository(getDb());
  }

  async listSessions({ page, limit, extension, hasErrors, hasCaptures }: SessionFilter) {
    const conditions: SQL[] = [];
    if (extension) conditions.push(eq(extensionSessions.extension, extension));
    if (hasErrors) conditions.push(sql`${extensionSessions.errorCount} > 0`);
    if (hasCaptures) conditions.push(sql`${extensionSessions.pickerCaptureCount} > 0`);
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [count]] = await Promise.all([
      this.db
        .select(sessionColumns)
        .from(extensionSessions)
        .leftJoin(users, eq(extensionSessions.userId, users.id))
        .where(where)
        .orderBy(desc(extensionSessions.updatedAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ total }).from(extensionSessions).where(where),
    ]);
    return { sessions: rows, total: count?.total ?? 0 };
  }

  /** One session + its full event timeline (capped at 2000), or null. */
  async findSessionTimeline(id: string) {
    const [session] = await this.db
      .select({ ...sessionColumns, userAgent: extensionSessions.userAgent, ipAddress: extensionSessions.ipAddress })
      .from(extensionSessions)
      .leftJoin(users, eq(extensionSessions.userId, users.id))
      .where(eq(extensionSessions.id, id))
      .limit(1);
    if (!session) return null;
    const events = await this.db
      .select()
      .from(extensionEvents)
      .where(eq(extensionEvents.sessionId, id))
      .orderBy(extensionEvents.createdAt)
      .limit(2000);
    return { session, events };
  }

  /** picker_capture events (each a candidate siteConfigs rule) + top hosts. */
  async listCaptures({ page, limit, host, extension }: CaptureFilter) {
    const conditions: SQL[] = [eq(extensionEvents.kind, "picker_capture")];
    if (host) conditions.push(eq(extensionEvents.host, host));
    if (extension) conditions.push(eq(extensionSessions.extension, extension));
    const where = and(...conditions);
    const [rows, [count], byHost] = await Promise.all([
      this.db
        .select({
          id: extensionEvents.id,
          sessionId: extensionEvents.sessionId,
          url: extensionEvents.url,
          host: extensionEvents.host,
          payload: extensionEvents.payload,
          createdAt: extensionEvents.createdAt,
          extension: extensionSessions.extension,
          userEmail: users.email,
        })
        .from(extensionEvents)
        .innerJoin(extensionSessions, eq(extensionEvents.sessionId, extensionSessions.id))
        .leftJoin(users, eq(extensionSessions.userId, users.id))
        .where(where)
        .orderBy(desc(extensionEvents.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ total })
        .from(extensionEvents)
        .innerJoin(extensionSessions, eq(extensionEvents.sessionId, extensionSessions.id))
        .where(where),
      this.db
        .select({ host: extensionEvents.host, captures: total })
        .from(extensionEvents)
        .where(eq(extensionEvents.kind, "picker_capture"))
        .groupBy(extensionEvents.host)
        .orderBy(desc(sql`count(*)`))
        .limit(20),
    ]);
    return { captures: rows, total: count?.total ?? 0, byHost };
  }
}
