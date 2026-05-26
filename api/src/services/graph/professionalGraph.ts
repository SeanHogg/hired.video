/**
 * Professional graph — the LinkedIn-Recruiter parity layer that exposes
 * mutual connections, 2nd-degree paths, and "top introducers" against
 * the existing `user_connections` table. Nothing here changes the
 * schema; this is pure traversal logic that turns a stored social
 * graph into the queries a recruiter actually runs:
 *
 *   - "Who do I know in common with this candidate?"  (mutuals)
 *   - "How do I reach this candidate via a warm intro?"  (2nd-degree path)
 *   - "Across my recent searches, who are the people best positioned
 *      to introduce me to the strongest candidates?"  (top introducers)
 *
 * Closeness to LinkedIn's product is intentional — those three queries
 * are 80% of why a recruiter pays $1,080/mo for InMail + the graph.
 * The remaining 20% (sponsored InMail, recruiter-network signal,
 * Sales Navigator intent) is structural distribution and not closed
 * by feature work.
 */

import { and, eq, inArray, or } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const ACCEPTED = "Accepted";

/** All accepted-connection peer ids for one user, bidirectional. */
async function fetchAcceptedPeers(userId: string): Promise<Set<string>> {
  const db = getDb();
  const t = schema.userConnections;
  const rows = await db
    .select({ from: t.fromUserId, to: t.toUserId })
    .from(t)
    .where(
      and(
        or(eq(t.fromUserId, userId), eq(t.toUserId, userId)),
        eq(t.status, ACCEPTED),
      ),
    )
    .catch(() => [] as { from: string; to: string }[]);
  const peers = new Set<string>();
  for (const r of rows as any[]) {
    const other = r.from === userId ? r.to : r.from;
    if (other && other !== userId) peers.add(other);
  }
  return peers;
}

export interface PersonRef {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  headline: string | null;
}

async function hydratePeople(ids: string[]): Promise<Map<string, PersonRef>> {
  if (ids.length === 0) return new Map();
  const db = getDb();
  const usersTable = schema.users;
  const profilesTable = (schema as any).userProfiles;
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatarUrl: profilesTable?.avatarUrl ?? usersTable.id,
      headline: profilesTable?.headline ?? usersTable.id,
    })
    .from(usersTable)
    // Best-effort join — when userProfiles isn't around we still get id + name
    .leftJoin(profilesTable, eq(profilesTable.userId, usersTable.id))
    .where(inArray(usersTable.id, ids))
    .catch(() => [] as any[]);
  const map = new Map<string, PersonRef>();
  for (const r of rows as any[]) {
    map.set(r.id, {
      userId: r.id,
      name: r.name ?? null,
      avatarUrl: typeof r.avatarUrl === "string" ? r.avatarUrl : null,
      headline: typeof r.headline === "string" ? r.headline : null,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Mutual connections
// ---------------------------------------------------------------------------

export interface MutualConnectionsResult {
  fromUserId: string;
  toUserId: string;
  mutualCount: number;
  mutuals: PersonRef[];
  /** First-degree if either user is the other's direct connection. */
  isDirectConnection: boolean;
}

export async function findMutualConnections(
  viewerId: string,
  targetId: string,
  limit = 25,
): Promise<MutualConnectionsResult> {
  if (viewerId === targetId) {
    return { fromUserId: viewerId, toUserId: targetId, mutualCount: 0, mutuals: [], isDirectConnection: false };
  }
  const [viewerPeers, targetPeers] = await Promise.all([
    fetchAcceptedPeers(viewerId),
    fetchAcceptedPeers(targetId),
  ]);
  const isDirectConnection = viewerPeers.has(targetId);
  const mutualIds: string[] = [];
  for (const peer of viewerPeers) {
    if (targetPeers.has(peer)) mutualIds.push(peer);
  }
  const sliced = mutualIds.slice(0, limit);
  const hydrated = await hydratePeople(sliced);
  const mutuals = sliced
    .map((id) => hydrated.get(id))
    .filter((p): p is PersonRef => !!p);
  return {
    fromUserId: viewerId,
    toUserId: targetId,
    mutualCount: mutualIds.length,
    mutuals,
    isDirectConnection,
  };
}

// ---------------------------------------------------------------------------
// 2nd-degree path — bounded BFS at depth 2 (mutual is depth 1)
// ---------------------------------------------------------------------------

export type Degree = 1 | 2 | "none";

export interface ConnectionPath {
  degree: Degree;
  /** When degree = 2, the chain of intermediate user ids (viewer → mid → target). */
  via: PersonRef[];
}

export async function findShortestPath(
  viewerId: string,
  targetId: string,
): Promise<ConnectionPath> {
  if (viewerId === targetId) return { degree: "none", via: [] };
  const viewerPeers = await fetchAcceptedPeers(viewerId);
  if (viewerPeers.has(targetId)) return { degree: 1, via: [] };

  // 2nd degree — any of the viewer's connections is connected to the target?
  // We fetch each peer's accepted peers in parallel; bounded by the viewer's
  // own connection count which is well-controlled (typical recruiter < 1000).
  const peerArr = [...viewerPeers];
  const peerPeers = await Promise.all(peerArr.map((p) => fetchAcceptedPeers(p)));
  for (let i = 0; i < peerArr.length; i++) {
    if (peerPeers[i].has(targetId)) {
      const hydrated = await hydratePeople([peerArr[i]]);
      const mid = hydrated.get(peerArr[i]);
      return { degree: 2, via: mid ? [mid] : [] };
    }
  }
  return { degree: "none", via: [] };
}

// ---------------------------------------------------------------------------
// Top introducers — which of MY connections are connected to the most
// people in a candidate pool. Used by the recruiter to pick the
// person they should ask for a batch of warm intros.
// ---------------------------------------------------------------------------

export interface IntroducerRanking {
  introducer: PersonRef;
  reachableCount: number;
  reachableSample: PersonRef[];
}

export async function rankTopIntroducers(
  viewerId: string,
  candidatePool: string[],
  limit = 10,
): Promise<IntroducerRanking[]> {
  const viewerPeers = await fetchAcceptedPeers(viewerId);
  if (viewerPeers.size === 0 || candidatePool.length === 0) return [];

  const peerArr = [...viewerPeers];
  const peerPeers = await Promise.all(peerArr.map((p) => fetchAcceptedPeers(p)));
  const candSet = new Set(candidatePool);

  const reachable = new Map<string, string[]>();
  for (let i = 0; i < peerArr.length; i++) {
    const hits: string[] = [];
    for (const c of peerPeers[i]) {
      if (candSet.has(c)) hits.push(c);
    }
    if (hits.length > 0) reachable.set(peerArr[i], hits);
  }
  if (reachable.size === 0) return [];

  const sorted = [...reachable.entries()].sort((a, b) => b[1].length - a[1].length);
  const top = sorted.slice(0, limit);

  // Hydrate the introducer set + a sample of each one's reachable candidates.
  const allIdsToHydrate = new Set<string>();
  for (const [introId, hits] of top) {
    allIdsToHydrate.add(introId);
    for (const h of hits.slice(0, 3)) allIdsToHydrate.add(h);
  }
  const hydrated = await hydratePeople([...allIdsToHydrate]);

  return top
    .map(([introId, hits]) => {
      const introducer = hydrated.get(introId);
      if (!introducer) return null;
      return {
        introducer,
        reachableCount: hits.length,
        reachableSample: hits.slice(0, 3).map((h) => hydrated.get(h)).filter((p): p is PersonRef => !!p),
      };
    })
    .filter((r): r is IntroducerRanking => r !== null);
}

// ---------------------------------------------------------------------------
// Warm-intro request — opens a DM with a mutual asking them to introduce
// the viewer to the target. This is the action half of the warm-network
// surface: the graph endpoints above tell the viewer WHO can introduce
// them; this turns that into a real ask sitting in the mutual's inbox.
//
// The target is intentionally NOT added to the conversation — the mutual
// is the gatekeeper and decides whether to forward, accept, or decline.
// ---------------------------------------------------------------------------

export interface WarmIntroResult {
  conversationId: string;
  messageId: string;
}

export type WarmIntroError =
  | "self"
  | "via_not_mutual"
  | "target_missing"
  | "via_missing";

export async function requestWarmIntro(
  viewerId: string,
  viaUserId: string,
  targetUserId: string,
  message: string,
): Promise<WarmIntroResult | { error: WarmIntroError }> {
  if (viewerId === viaUserId || viewerId === targetUserId || viaUserId === targetUserId) {
    return { error: "self" };
  }

  const db = getDb();
  const usersTable = schema.users;
  const rows = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(inArray(usersTable.id, [viaUserId, targetUserId]))
    .catch(() => [] as { id: string; name: string | null }[]);

  const viaRow = rows.find((r: any) => r.id === viaUserId);
  const targetRow = rows.find((r: any) => r.id === targetUserId);
  if (!viaRow) return { error: "via_missing" };
  if (!targetRow) return { error: "target_missing" };

  const [viewerPeers, targetPeers] = await Promise.all([
    fetchAcceptedPeers(viewerId),
    fetchAcceptedPeers(targetUserId),
  ]);
  if (!viewerPeers.has(viaUserId) || !targetPeers.has(viaUserId)) {
    return { error: "via_not_mutual" };
  }

  const targetName = targetRow.name?.trim() || "a connection";
  const subject = `Warm intro request: ${targetName}`.slice(0, 500);

  const [convo] = await db
    .insert(schema.conversations)
    .values({ subject, type: "warm_intro" } as any)
    .returning();

  await Promise.all(
    [viewerId, viaUserId].map((pId) =>
      db
        .insert(schema.conversationParticipants)
        .values({ conversationId: convo.id, userId: pId, role: "member" } as any),
    ),
  );

  const [msg] = await db
    .insert(schema.messages)
    .values({
      conversationId: convo.id,
      senderId: viewerId,
      content: message,
      contentType: "text",
      metadata: { kind: "warm_intro_request", targetUserId },
    } as any)
    .returning();

  return { conversationId: convo.id, messageId: msg.id };
}

// ---------------------------------------------------------------------------
// Public exports for testing
// ---------------------------------------------------------------------------

export const __internals = { fetchAcceptedPeers };
