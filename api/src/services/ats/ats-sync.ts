/**
 * ATS integration use cases (#64): owner-gated connection management, the
 * manual candidate pull, and inbound-webhook processing. Connections live in
 * provider_connections (AtsConnections adapter); candidates mirror into the
 * company owner's talent pool (talentPoolRepository) and webhook events land
 * on the candidate timeline (`candidate_interactions`).
 */
import { DomainError } from "../../domains/errors.js";
import { logger } from "../../lib/logger.js";
import { hexToBytes, hmacSha256Verify } from "../../utils/crypto.js";
import { AtsConnections, type AtsConnectionView } from "../provider-connections/ats-connections.js";
import { findCompanyOwnerId } from "../../repositories/listsRepository.js";
import {
  findEntriesByEmails,
  insertInteraction,
  insertTalentPoolEntries,
} from "../../repositories/talentPoolRepository.js";
import {
  extractCandidateFromWebhook,
  extractStageFromWebhook,
  fetchGreenhouseCandidates,
  fetchLeverCandidates,
  fetchWorkdayCandidates,
  type AtsProvider,
  type NormalizedCandidate,
} from "./provider-candidates.js";

// ─── Ownership ────────────────────────────────────────────────────────────────

/** 403 unless `userId` owns the company; returns the owner id. */
async function requireCompanyOwner(userId: string, companyId: string): Promise<string> {
  const ownerId = await findCompanyOwnerId(companyId);
  if (!ownerId || ownerId !== userId) throw new DomainError(403, "FORBIDDEN", "Access denied");
  return ownerId;
}

/** The connection (404) after asserting the caller owns its company (403). */
async function requireOwnedConnection(
  connections: AtsConnections,
  userId: string,
  connectionId: string,
): Promise<{ conn: AtsConnectionView; ownerId: string }> {
  const conn = await connections.findById(connectionId);
  if (!conn) throw new DomainError(404, "NOT_FOUND", "Connection not found");
  const ownerId = await requireCompanyOwner(userId, conn.companyId);
  return { conn, ownerId };
}

// ─── Connection management ────────────────────────────────────────────────────

export async function listAtsConnections(userId: string, companyId: string, connections = new AtsConnections()) {
  await requireCompanyOwner(userId, companyId);
  return (await connections.listForCompany(companyId)).map((r) => ({
    id: r.id,
    provider: r.provider,
    isActive: r.isActive,
    lastSyncAt: r.lastSyncAt,
    createdAt: r.createdAt,
  }));
}

/** One connection per (company, provider): re-connecting re-keys it. Returns
 *  null when the write fails (logged) — the route answers 503. */
export async function connectAts(
  userId: string,
  input: {
    companyId: string;
    provider: AtsProvider;
    apiKey: string;
    webhookSecret?: string;
    config: Record<string, unknown>;
  },
  connections = new AtsConnections(),
): Promise<AtsConnectionView | null> {
  await requireCompanyOwner(userId, input.companyId);
  return connections.connect({ ...input, webhookSecret: input.webhookSecret }).catch((err) => {
    logger.error("[ats] connect failed", err);
    return null;
  });
}

export async function disconnectAts(userId: string, connectionId: string, connections = new AtsConnections()) {
  const { conn } = await requireOwnedConnection(connections, userId, connectionId);
  await connections.remove(conn.id);
}

// ─── Candidate sync ───────────────────────────────────────────────────────────

/**
 * Upserts normalized candidates into the owner's talent pool, deduped by email
 * within that pool (one batched query, never N+1). Returns counts plus an
 * email→talentPoolCandidateId map covering BOTH pre-existing and newly inserted
 * rows, so webhook callers can resolve the candidate id without a re-query.
 * Mirrors the extension-capture pattern: candidateId is the owner's id as a
 * placeholder until the candidate links a real hired.video account.
 *
 * Shared by the manual pull and the inbound webhook so the two paths can't
 * drift on dedup or insert shape.
 */
async function upsertCandidatesForOwner(
  ownerId: string,
  candidates: NormalizedCandidate[],
  provider: AtsProvider,
): Promise<{ imported: number; skipped: number; idByEmail: Map<string, string> }> {
  const idByEmail = new Map<string, string>();
  if (candidates.length === 0) return { imported: 0, skipped: 0, idByEmail };

  const emails = Array.from(
    new Set(candidates.map((c) => c.email?.toLowerCase()).filter((e): e is string => !!e)),
  );
  const existing = new Set<string>();
  const rows = await findEntriesByEmails(ownerId, emails).catch(() => [] as Array<{ id: string; email: string | null }>);
  for (const r of rows) {
    if (!r.email) continue;
    const key = r.email.toLowerCase();
    existing.add(key);
    idByEmail.set(key, r.id);
  }

  const toInsert = candidates.filter((c) => {
    const key = c.email?.toLowerCase();
    if (key && existing.has(key)) return false;
    if (key) existing.add(key); // collapse in-batch duplicates too
    return true;
  });
  const skipped = candidates.length - toInsert.length;

  const inserted = await insertTalentPoolEntries(toInsert.map((c) => ({
    recruiterId: ownerId,
    candidateId: ownerId, // placeholder until the candidate links an account
    candidateName: c.name,
    candidateEmail: c.email ?? undefined,
    candidateTitle: c.title ?? undefined,
    currentCompany: c.company ?? undefined,
    currentTitle: c.title ?? undefined,
    status: "active",
    tags: [`ats:${provider}`],
  }))).catch((e) => {
    logger.error(`[ats:${provider}] upsert failed`, e);
    return [] as Array<{ id: string; email: string | null }>;
  });
  for (const r of inserted) if (r.email) idByEmail.set(r.email.toLowerCase(), r.id);

  return { imported: inserted.length, skipped, idByEmail };
}

/** Fetches candidates from the provider and upserts them into the owner's pool. */
async function importFromProvider(
  ownerId: string,
  provider: AtsProvider,
  apiKey: string,
  config: Record<string, unknown>,
): Promise<{ candidatesImported: number; skippedDuplicates: number; note: string }> {
  let candidates: NormalizedCandidate[];
  switch (provider) {
    case "greenhouse":
      candidates = await fetchGreenhouseCandidates(apiKey);
      break;
    case "lever":
      candidates = await fetchLeverCandidates(apiKey);
      break;
    case "workday":
      if (!config?.raasUrl || !config?.username) {
        return {
          candidatesImported: 0,
          skippedDuplicates: 0,
          note: "Workday sync requires config.raasUrl + config.username (RaaS report + ISU). Not configured.",
        };
      }
      candidates = await fetchWorkdayCandidates(apiKey, config);
      break;
    default:
      return { candidatesImported: 0, skippedDuplicates: 0, note: "Unknown provider." };
  }

  const { imported, skipped } = await upsertCandidatesForOwner(ownerId, candidates, provider);
  return {
    candidatesImported: imported,
    skippedDuplicates: skipped,
    note: `${provider}: imported ${imported}, skipped ${skipped} duplicate(s).`,
  };
}

/** Pulls candidates for an owned connection and stamps the sync time. */
export async function syncAtsConnection(userId: string, connectionId: string, connections = new AtsConnections()) {
  const { conn, ownerId } = await requireOwnedConnection(connections, userId, connectionId);
  const result = await importFromProvider(
    ownerId,
    conn.provider as AtsProvider,
    await connections.apiKey(conn.id),
    conn.config,
  );
  await connections.markSynced(conn.id);
  return {
    provider: conn.provider,
    synced: result.candidatesImported,
    skippedDuplicates: result.skippedDuplicates,
    lastSyncAt: new Date().toISOString(),
    note: result.note,
  };
}

// ─── Inbound webhooks ─────────────────────────────────────────────────────────

async function verifyHmacSignature(sig: string, payload: string, secret: string): Promise<boolean> {
  try {
    return await hmacSha256Verify(secret, payload, hexToBytes(sig));
  } catch {
    return false;
  }
}

/**
 * Verifies (401 on a bad signature) and processes an inbound ATS webhook:
 * mirrors the candidate into the connection company owner's talent pool and
 * records the event on the candidate timeline. Webhooks don't carry our
 * connection id, so the first connection for the provider is used — see gap
 * register #2016 for per-connection attribution.
 */
export async function processAtsWebhook(
  provider: AtsProvider,
  body: any,
  signature: string | null,
  connections = new AtsConnections(),
): Promise<void> {
  const conn = await connections.forWebhook(provider);
  const webhookSecret = conn?.webhookSecret ?? null;
  if (webhookSecret && signature) {
    const valid = await verifyHmacSignature(signature, JSON.stringify(body), webhookSecret);
    if (!valid) throw new DomainError(401, "UNAUTHORIZED", "Invalid webhook signature");
  }

  const eventType: string = body.action ?? body.event ?? body.type ?? "unknown";
  if (!conn?.companyId) {
    logger.info(`[ats:${provider}] webhook event — no connection, not processed`, { eventType });
    return;
  }
  const ownerId = await findCompanyOwnerId(conn.companyId);
  if (ownerId) await handleWebhookEvent(provider, ownerId, eventType, body);
}

async function handleWebhookEvent(provider: AtsProvider, ownerId: string, eventType: string, body: any): Promise<void> {
  logger.info(`[ats:${provider}] webhook event`, { eventType });

  const candidate = extractCandidateFromWebhook(provider, body);
  let talentPoolId: string | null = null;
  if (candidate && (candidate.email || candidate.name !== "(unnamed)")) {
    const { idByEmail } = await upsertCandidatesForOwner(ownerId, [candidate], provider);
    talentPoolId = candidate.email ? idByEmail.get(candidate.email.toLowerCase()) ?? null : null;
  }

  const stage = extractStageFromWebhook(provider, body);
  await insertInteraction({
    recruiterId: ownerId,
    candidateId: ownerId, // placeholder until the candidate links an account
    talentPoolId: talentPoolId ?? undefined,
    type: "ats_webhook",
    subject: eventType,
    notes: stage ? `ATS ${provider} stage: ${stage}` : `ATS ${provider} event: ${eventType}`,
    metadata: { provider, eventType, stage },
  }).catch((e) => logger.error(`[ats:${provider}] interaction insert failed`, e));
}
