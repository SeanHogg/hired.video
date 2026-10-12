/**
 * Duplicate-contact reconciliation: score an incoming contact against the
 * owner's existing ones, then auto-merge or queue for review per the
 * owner's policy; plus the owner's approve/reject decisions on the queue.
 */
import type { Repos } from "../../repositories/index.js";
import type { ContactRow, ContactPatch } from "../../repositories/contactsRepository.js";
import {
  DEFAULT_MERGE_POLICY,
  MERGE_POLICY_MODES,
  duplicateConfidenceBps,
  mergeDecision,
  type MergePolicyMode,
} from "../../../../shared/contacts.js";

export type MergeDeps = Pick<Repos, "contacts" | "personMerge">;

export type ReconcileOutcome =
  | { kind: "none" }
  | { kind: "merged"; into: ContactRow }
  | { kind: "queued"; queueId: string; targetId: string; confidenceBps: number };

const MERGEABLE_FIELDS = ["email", "fullName", "company", "title", "phone", "linkedinUrl", "linkedUserId", "notes", "enrichedAt"] as const;

/** Fields `target` lacks that `source` has — merges never overwrite data. */
export function fillMissing(target: ContactRow, source: Partial<ContactRow>): ContactPatch {
  const patch: Record<string, unknown> = {};
  for (const field of MERGEABLE_FIELDS) {
    if ((target[field] === null || target[field] === undefined || target[field] === "") && source[field]) {
      patch[field] = source[field];
    }
  }
  // A lead that turns out to be a known contact stays a contact.
  if (target.lifecycle === "lead" && source.lifecycle === "contact") patch.lifecycle = "contact";
  return patch as ContactPatch;
}

export async function resolveMergePolicy(
  deps: MergeDeps,
  ownerUserId: string,
): Promise<{ workspaceId: string | null; mode: MergePolicyMode; autoThresholdBps: number }> {
  const workspaceId = await deps.personMerge.findPersonalWorkspaceId(ownerUserId);
  const row = workspaceId ? await deps.personMerge.findPolicy(workspaceId) : null;
  const mode = (MERGE_POLICY_MODES as readonly string[]).includes(row?.mode ?? "")
    ? (row!.mode as MergePolicyMode)
    : DEFAULT_MERGE_POLICY.mode;
  return { workspaceId, mode, autoThresholdBps: row?.autoThresholdBps ?? DEFAULT_MERGE_POLICY.autoThresholdBps };
}

/** Fold `source` into `target`: fill target's gaps, move pipeline links,
 *  delete source (its queue rows cascade). Returns the updated target. */
export async function mergeContacts(
  deps: MergeDeps,
  ownerUserId: string,
  target: ContactRow,
  source: ContactRow,
): Promise<ContactRow> {
  const patch = fillMissing(target, source);
  // The unique (owner, email) index forbids two rows sharing an email, so
  // drop source first when its email moves onto target.
  await deps.contacts.moveJobLinks(source.id, target.id);
  await deps.contacts.delete(ownerUserId, source.id);
  if (Object.keys(patch).length === 0) return target;
  return (await deps.contacts.update(ownerUserId, target.id, patch)) ?? target;
}

/** Score `contact` against the owner's existing contacts and act on the
 *  best match. The existing (older) contact is always the merge target. */
export async function reconcileContact(
  deps: MergeDeps,
  ownerUserId: string,
  contact: ContactRow,
): Promise<ReconcileOutcome> {
  const candidates = await deps.contacts.findDuplicateCandidates(ownerUserId, contact.id, {
    fullName: contact.fullName,
    phone: contact.phone,
    linkedinUrl: contact.linkedinUrl,
  });
  let best: { row: ContactRow; bps: number } | null = null;
  for (const row of candidates) {
    const bps = duplicateConfidenceBps(contact, row);
    if (!best || bps > best.bps) best = { row, bps };
  }
  if (!best) return { kind: "none" };

  const policy = await resolveMergePolicy(deps, ownerUserId);
  const decision = mergeDecision(best.bps, policy);
  if (decision === "ignore") return { kind: "none" };
  if (decision === "auto") {
    return { kind: "merged", into: await mergeContacts(deps, ownerUserId, best.row, contact) };
  }
  const queued = await deps.personMerge.enqueue({
    workspaceId: policy.workspaceId,
    ownerUserId,
    targetPersonId: best.row.id,
    sourcePersonId: contact.id,
    confidenceBps: best.bps,
    status: "pending",
  });
  return queued
    ? { kind: "queued", queueId: queued.id, targetId: best.row.id, confidenceBps: best.bps }
    : { kind: "none" };
}

export type DecisionResult = "merged" | "rejected" | "not_found" | "stale";

/** Owner decision on a pending queue row. */
export async function decideMerge(
  deps: MergeDeps,
  ownerUserId: string,
  queueId: string,
  approve: boolean,
): Promise<DecisionResult> {
  const row = await deps.personMerge.findById(ownerUserId, queueId);
  if (!row) return "not_found";
  if (row.status !== "pending") return "stale";
  if (!approve) {
    await deps.personMerge.decide(row.id, "rejected", ownerUserId);
    return "rejected";
  }
  const [target, source] = await Promise.all([
    deps.contacts.findById(ownerUserId, row.targetPersonId),
    deps.contacts.findById(ownerUserId, row.sourcePersonId),
  ]);
  if (!target || !source) return "stale";
  await mergeContacts(deps, ownerUserId, target, source);
  return "merged";
}
