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

import { and, asc, eq, inArray, or } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { emitNotification, resolveActor } from "../notifications/notificationService.js";

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
  /** True when this request opened a new conversation; false when an
   *  identical pending request between (viewer → via → target) already
   *  existed and we returned that one instead. */
  created: boolean;
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

  // Dedup: if the same viewer already has a pending warm-intro ask to
  // this via for this target, return that conversation instead of
  // minting a new one. Mirrors the `uq_coffee_requests_pending_pair`
  // pattern but enforced in service code since `targetUserId` lives in
  // message metadata rather than a column we could index.
  const existing = await findPendingWarmIntro(viewerId, viaUserId, targetUserId);
  if (existing) {
    return { conversationId: existing.conversationId, messageId: existing.messageId, created: false };
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

  // Fire-and-forget inbox notification. Mirrors the connection-request
  // pattern in routes/users.ts so the mutual sees the ask on their bell
  // icon, not just on their next inbox refresh.
  (async () => {
    try {
      const repos = buildRepos(db);
      const { actor, actorName } = await resolveActor({ repos }, viewerId);
      await emitNotification(
        { repos },
        {
          recipientIds: [viaUserId],
          type: "warm_intro_received",
          actor,
          title: `${actorName} asked you for a warm intro`,
          message: `${actorName} would like an introduction to ${targetName}.`,
          target: { id: convo.id, type: "conversation" },
          extraData: { targetUserId, kind: "warm_intro_request" },
        },
      );
    } catch (err) {
      console.error("[warm-intro] notification insert failed:", err);
    }
  })();

  return { conversationId: convo.id, messageId: msg.id, created: true };
}

/** Find an existing pending warm-intro from viewer → via for target.
 *  Used by `requestWarmIntro` to dedupe and by callers that want to
 *  check before opening the ask dialog. Returns null if none exists or
 *  the existing one has already been forwarded. */
async function findPendingWarmIntro(
  viewerId: string,
  viaUserId: string,
  targetUserId: string,
): Promise<{ conversationId: string; messageId: string } | null> {
  const db = getDb();

  // Conversations of type='warm_intro' where BOTH viewer and via are
  // participants. We over-fetch on viewer alone, then narrow on via.
  const viewerConvos = await db
    .select({ conversationId: schema.conversationParticipants.conversationId })
    .from(schema.conversationParticipants)
    .innerJoin(
      schema.conversations,
      eq(schema.conversationParticipants.conversationId, schema.conversations.id),
    )
    .where(
      and(
        eq(schema.conversationParticipants.userId, viewerId),
        eq(schema.conversations.type, "warm_intro"),
      ),
    )
    .catch(() => [] as { conversationId: string }[]);
  if (viewerConvos.length === 0) return null;

  const ids = viewerConvos.map((r: any) => r.conversationId);
  const viaPartRows = await db
    .select({ conversationId: schema.conversationParticipants.conversationId })
    .from(schema.conversationParticipants)
    .where(
      and(
        inArray(schema.conversationParticipants.conversationId, ids),
        eq(schema.conversationParticipants.userId, viaUserId),
      ),
    )
    .catch(() => [] as { conversationId: string }[]);
  if (viaPartRows.length === 0) return null;

  const sharedIds = viaPartRows.map((r: any) => r.conversationId);
  const msgMap = await fetchFirstAndForwardedMessages(sharedIds);
  for (const convoId of sharedIds) {
    const pair = msgMap.get(convoId);
    if (!pair?.first) continue;
    if (pair.forwarded) continue; // already forwarded — not pending
    if (pair.first.senderId !== viewerId) continue;
    if (pair.first?.metadata?.targetUserId !== targetUserId) continue;
    return { conversationId: convoId, messageId: pair.first.id };
  }
  return null;
}

// ---------------------------------------------------------------------------
// List warm-intro requests for a given viewer.
//
// `side` semantics:
//   - "outgoing": viewer is the requester (sent the ask)
//   - "incoming": viewer is the via (the mutual being asked)
//
// Source of truth is the FIRST message in each `type='warm_intro'`
// conversation the viewer participates in:
//   - metadata.kind          = "warm_intro_request"
//   - metadata.targetUserId  = the person the requester wants to meet
//   - senderId               = the requester
// We classify by comparing senderId to viewer.
//
// Forwarded state is detected by the presence of a second message with
// metadata.kind = "warm_intro_forwarded" in the same conversation
// (written by forwardWarmIntro). This keeps state on the existing
// messages table — no schema migration needed.
// ---------------------------------------------------------------------------

export interface WarmIntroSummary {
  conversationId: string;
  createdAt: string;
  message: string;
  status: "pending" | "forwarded";
  forwardedConversationId: string | null;
  requester: PersonRef;
  via: PersonRef;
  target: PersonRef;
}

export type WarmIntroSide = "incoming" | "outgoing";

async function fetchFirstAndForwardedMessages(
  conversationIds: string[],
): Promise<Map<string, { first: any; forwarded: any | null }>> {
  if (conversationIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.messages)
    .where(inArray(schema.messages.conversationId, conversationIds))
    .orderBy(asc(schema.messages.createdAt))
    .catch(() => [] as any[]);

  const out = new Map<string, { first: any; forwarded: any | null }>();
  for (const m of rows as any[]) {
    const slot = out.get(m.conversationId) ?? { first: null, forwarded: null };
    if (!slot.first) slot.first = m;
    if (!slot.forwarded && m?.metadata?.kind === "warm_intro_forwarded") {
      slot.forwarded = m;
    }
    out.set(m.conversationId, slot);
  }
  return out;
}

export async function listWarmIntros(
  viewerId: string,
  side: WarmIntroSide,
): Promise<WarmIntroSummary[]> {
  const db = getDb();

  // Conversations of type='warm_intro' the viewer participates in.
  const myConvoRows = await db
    .select({ conversationId: schema.conversationParticipants.conversationId })
    .from(schema.conversationParticipants)
    .innerJoin(
      schema.conversations,
      eq(schema.conversationParticipants.conversationId, schema.conversations.id),
    )
    .where(
      and(
        eq(schema.conversationParticipants.userId, viewerId),
        eq(schema.conversations.type, "warm_intro"),
      ),
    )
    .catch(() => [] as { conversationId: string }[]);

  const convoIds = myConvoRows.map((r: any) => r.conversationId);
  if (convoIds.length === 0) return [];

  const msgMap = await fetchFirstAndForwardedMessages(convoIds);

  // Build raw rows, classifying by side and collecting people to hydrate.
  type Raw = {
    conversationId: string;
    createdAt: Date;
    messageContent: string;
    senderId: string;
    targetUserId: string;
    forwarded: { id: string; metadata: any } | null;
  };
  const raw: Raw[] = [];
  for (const id of convoIds) {
    const pair = msgMap.get(id);
    if (!pair?.first) continue;
    const targetUserId = pair.first?.metadata?.targetUserId;
    if (!targetUserId) continue;
    const senderId = pair.first.senderId as string;
    const isOutgoing = senderId === viewerId;
    if (side === "outgoing" && !isOutgoing) continue;
    if (side === "incoming" && isOutgoing) continue;
    raw.push({
      conversationId: id,
      createdAt: pair.first.createdAt,
      messageContent: pair.first.content,
      senderId,
      targetUserId,
      forwarded: pair.forwarded
        ? { id: pair.forwarded.id, metadata: pair.forwarded.metadata }
        : null,
    });
  }
  if (raw.length === 0) return [];

  // For each conversation we need 3 people: requester (=senderId), via
  // (= the OTHER participant), target (= metadata.targetUserId).
  // First pull all participants for these conversations so we can find via.
  const partRows = await db
    .select({
      conversationId: schema.conversationParticipants.conversationId,
      userId: schema.conversationParticipants.userId,
    })
    .from(schema.conversationParticipants)
    .where(inArray(schema.conversationParticipants.conversationId, convoIds))
    .catch(() => [] as { conversationId: string; userId: string }[]);

  const partsByConvo = new Map<string, string[]>();
  for (const r of partRows as any[]) {
    const arr = partsByConvo.get(r.conversationId) ?? [];
    arr.push(r.userId);
    partsByConvo.set(r.conversationId, arr);
  }

  const allIds = new Set<string>();
  for (const r of raw) {
    allIds.add(r.senderId);
    allIds.add(r.targetUserId);
    for (const p of partsByConvo.get(r.conversationId) ?? []) allIds.add(p);
  }
  const hydrated = await hydratePeople([...allIds]);
  const blank = (id: string): PersonRef => ({
    userId: id,
    name: null,
    avatarUrl: null,
    headline: null,
  });

  return raw
    .map((r): WarmIntroSummary | null => {
      const parts = partsByConvo.get(r.conversationId) ?? [];
      const viaId = parts.find((p) => p !== r.senderId);
      if (!viaId) return null;
      return {
        conversationId: r.conversationId,
        createdAt: r.createdAt.toISOString(),
        message: r.messageContent,
        status: r.forwarded ? "forwarded" : "pending",
        forwardedConversationId: r.forwarded?.metadata?.toConversationId ?? null,
        requester: hydrated.get(r.senderId) ?? blank(r.senderId),
        via: hydrated.get(viaId) ?? blank(viaId),
        target: hydrated.get(r.targetUserId) ?? blank(r.targetUserId),
      };
    })
    .filter((r): r is WarmIntroSummary => r !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Forward a warm intro. Closes LinkedIn's "Get introduced" loop:
//   1. Validates the caller is the `via` on a pending warm_intro convo.
//   2. Creates a NEW 3-party conversation (via + requester + target).
//   3. Seeds it with a system message ("Forwarded by {via}: {original}"),
//      so the target lands in context without re-typing.
//   4. Writes a `warm_intro_forwarded` marker message back into the
//      original convo, pointing at the new conversation — that's what
//      `listWarmIntros` reads to set status='forwarded'.
//
// Idempotent: if the convo is already forwarded, returns the existing
// new-conversation id rather than minting a second one.
// ---------------------------------------------------------------------------

export type ForwardWarmIntroError =
  | "not_found"
  | "not_via"
  | "not_warm_intro"
  | "missing_first_message";

export interface ForwardWarmIntroResult {
  /** The new 3-party conversation that includes the target. */
  forwardedConversationId: string;
  /** Whether this call actually created the new conversation, or just
   *  returned an existing forward (idempotent re-call). */
  created: boolean;
}

export async function forwardWarmIntro(
  viaUserId: string,
  originalConversationId: string,
): Promise<ForwardWarmIntroResult | { error: ForwardWarmIntroError }> {
  const db = getDb();

  // Convo + viewer-is-participant check rolled into one query.
  const [convo] = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, originalConversationId))
    .limit(1);
  if (!convo) return { error: "not_found" };
  if (convo.type !== "warm_intro") return { error: "not_warm_intro" };

  const parts = await db
    .select({ userId: schema.conversationParticipants.userId })
    .from(schema.conversationParticipants)
    .where(eq(schema.conversationParticipants.conversationId, originalConversationId));
  const partIds = parts.map((p: any) => p.userId);
  if (!partIds.includes(viaUserId)) return { error: "not_via" };

  // First message is the source of truth for requester + target.
  const msgs = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, originalConversationId))
    .orderBy(asc(schema.messages.createdAt));
  const first: any = msgs[0];
  if (!first || first?.metadata?.kind !== "warm_intro_request") {
    return { error: "missing_first_message" };
  }
  const requesterId: string = first.senderId;
  const targetUserId: string | undefined = first?.metadata?.targetUserId;
  if (!targetUserId) return { error: "missing_first_message" };
  if (requesterId === viaUserId) return { error: "not_via" };

  // Idempotency: if a forwarded marker already exists, return it.
  const existingForward: any = msgs.find(
    (m: any) => m?.metadata?.kind === "warm_intro_forwarded",
  );
  if (existingForward?.metadata?.toConversationId) {
    return {
      forwardedConversationId: existingForward.metadata.toConversationId,
      created: false,
    };
  }

  // Hydrate names for the seeded message.
  const namesRows = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(inArray(schema.users.id, [viaUserId, requesterId, targetUserId]));
  const nameById = new Map<string, string>(
    (namesRows as any[]).map((r) => [r.id, (r.name ?? "").trim() || "a connection"]),
  );
  const viaName = nameById.get(viaUserId) ?? "A connection";
  const requesterName = nameById.get(requesterId) ?? "Someone";
  const targetName = nameById.get(targetUserId) ?? "this person";

  // 1. Create the new 3-party conversation.
  const [newConvo] = await db
    .insert(schema.conversations)
    .values({
      subject: `${viaName} introduced ${requesterName}`.slice(0, 500),
      type: "direct",
    } as any)
    .returning();

  await Promise.all(
    [viaUserId, requesterId, targetUserId].map((pId) =>
      db
        .insert(schema.conversationParticipants)
        .values({ conversationId: newConvo.id, userId: pId, role: "member" } as any),
    ),
  );

  // 2. Seed with the original ask, attributed.
  const introContent =
    `Hi ${targetName} — wanted to introduce you to ${requesterName}.\n\n` +
    `Their original note to me:\n` +
    `"${(first.content ?? "").trim()}"\n\n` +
    `I'll let you two take it from here.`;
  await db
    .insert(schema.messages)
    .values({
      conversationId: newConvo.id,
      senderId: viaUserId,
      content: introContent,
      contentType: "text",
      metadata: {
        kind: "warm_intro_forward",
        fromConversationId: originalConversationId,
        requesterId,
        targetUserId,
      },
    } as any);

  // 3. Marker on the original convo. listWarmIntros reads this for status.
  await db.insert(schema.messages).values({
    conversationId: originalConversationId,
    senderId: viaUserId,
    content: `Forwarded the intro to ${targetName}.`,
    contentType: "text",
    metadata: {
      kind: "warm_intro_forwarded",
      toConversationId: newConvo.id,
    },
  } as any);

  // 4. Notify both the requester (their ask was forwarded!) and the target.
  (async () => {
    try {
      const repos = buildRepos(db);
      const { actor } = await resolveActor({ repos }, viaUserId);
      await emitNotification(
        { repos },
        {
          recipientIds: [requesterId, targetUserId],
          type: "warm_intro_forwarded",
          actor,
          title: `${viaName} introduced ${requesterName} to ${targetName}`,
          target: { id: newConvo.id, type: "conversation" },
          extraData: {
            kind: "warm_intro_forward",
            fromConversationId: originalConversationId,
          },
        },
      );
    } catch (err) {
      console.error("[warm-intro] forward notification failed:", err);
    }
  })();

  return { forwardedConversationId: newConvo.id, created: true };
}

// ---------------------------------------------------------------------------
// Public exports for testing
// ---------------------------------------------------------------------------

export const __internals = { fetchAcceptedPeers };
