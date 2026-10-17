/**
 * /api/network — network-driven warm-intro suggestions (#1678). Given a
 * target company, surface the caller's 1st- and 2nd-degree connections
 * there, so they can ask for an introduction instead of cold-applying.
 * ~80% of exec roles fill through network.
 *
 *   GET /api/network/warm-intros?company=Acme
 *
 * 1st degree — your accepted connections who work at the company (reach
 *              out directly).
 * 2nd degree — people at the company connected to one of your connections
 *              (ask that connection — the "connector" — for an intro).
 *
 * Connections are bidirectional rows in user_connections (from/to,
 * status='accepted'). The graph is walked in-memory over the caller's
 * connection set, which is bounded per user.
 */
import { Hono } from "hono";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { userConnections, userProfiles, users } = schema;

export const networkRoutes = new Hono<AppEnv>();

/** The set of userIds accepted-connected to `userId` (either direction). */
async function acceptedConnectionIds(db: any, userId: string): Promise<string[]> {
  const rows = await db
    .select({ from: userConnections.fromUserId, to: userConnections.toUserId })
    .from(userConnections)
    .where(
      and(
        eq(userConnections.status, "accepted"),
        or(eq(userConnections.fromUserId, userId), eq(userConnections.toUserId, userId)),
      ),
    );
  const out = new Set<string>();
  for (const r of rows) out.add(r.from === userId ? r.to : r.from);
  out.delete(userId);
  return [...out];
}

networkRoutes.get("/warm-intros", async (c) => {
  const userId = c.var.user?.sub as string | undefined;
  if (!userId) return c.json(error("UNAUTHORIZED", "auth required"), 401);
  const company = (c.req.query("company") ?? "").trim();
  if (!company) return c.json(error("VALIDATION_ERROR", "company is required"), 400);
  const db = getDb();

  const myConnIds = await acceptedConnectionIds(db, userId);
  if (myConnIds.length === 0) {
    return c.json(success({ company, firstDegree: [], secondDegree: [] }), 200);
  }
  const myConnSet = new Set(myConnIds);

  // 1st degree — my connections who work at the company.
  const firstDegree = await db
    .select({
      userId: users.id,
      name: users.name,
      title: userProfiles.currentRole,
      company: userProfiles.currentCompany,
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(inArray(users.id, myConnIds), ilike(userProfiles.currentCompany, `%${company}%`)))
    .limit(25);

  // 2nd degree — accepted connections of my connections, at the company,
  // who aren't me and aren't already a 1st-degree connection. Track which
  // of my connections (the connector) links to each.
  const edges = await db
    .select({ from: userConnections.fromUserId, to: userConnections.toUserId })
    .from(userConnections)
    .where(
      and(
        eq(userConnections.status, "accepted"),
        or(inArray(userConnections.fromUserId, myConnIds), inArray(userConnections.toUserId, myConnIds)),
      ),
    );
  // candidateId -> connectorId (a connection of mine who knows them)
  const candidateToConnector = new Map<string, string>();
  for (const e of edges) {
    const connector = myConnSet.has(e.from) ? e.from : myConnSet.has(e.to) ? e.to : null;
    if (!connector) continue;
    const candidate = connector === e.from ? e.to : e.from;
    if (candidate === userId || myConnSet.has(candidate)) continue; // me or already 1st-degree
    if (!candidateToConnector.has(candidate)) candidateToConnector.set(candidate, connector);
  }

  let secondDegree: Array<{ userId: string; name: string; title: string | null; company: string | null; connectorId: string; connectorName: string }> = [];
  const candidateIds = [...candidateToConnector.keys()];
  if (candidateIds.length > 0) {
    const atCompany = await db
      .select({
        userId: users.id,
        name: users.name,
        title: userProfiles.currentRole,
        company: userProfiles.currentCompany,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(inArray(users.id, candidateIds), ilike(userProfiles.currentCompany, `%${company}%`)))
      .limit(25);
    // Resolve connector names in one query.
    const connectorIds = [...new Set(atCompany.map((p: any) => candidateToConnector.get(p.userId)!).filter(Boolean))];
    const connectorNames = new Map<string, string>();
    if (connectorIds.length > 0) {
      const cn = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, connectorIds));
      for (const r of cn) connectorNames.set(r.id, r.name);
    }
    secondDegree = atCompany.map((p: any) => {
      const connectorId = candidateToConnector.get(p.userId)!;
      return {
        userId: p.userId,
        name: p.name,
        title: p.title,
        company: p.company,
        connectorId,
        connectorName: connectorNames.get(connectorId) ?? "A connection",
      };
    });
  }

  return c.json(success({ company, firstDegree, secondDegree }), 200);
});
