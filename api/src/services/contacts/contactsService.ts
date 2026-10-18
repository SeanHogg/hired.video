/**
 * Contacts use cases behind `/api/contacts` (owner-scoped CRM graph). Builds
 * the request's repositories, delegates to the focused services
 * (upsert / merge / pipeline / enrich) and turns their "reason" outcomes into
 * DomainErrors with the endpoint's historical status + code + message.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { buildRepos, type Repos } from "../../repositories/index.js";
import type { ContactListFilters } from "../../repositories/contactsRepository.js";
import type { ContactJobStage, ContactLifecycle, MergePolicyMode } from "../../../../shared/contacts.js";
import { upsertContact, updateContact, type ContactFields } from "./upsert.js";
import { decideMerge, resolveMergePolicy } from "./merge.js";
import { canManageJob, linkContactToJob, listContactJobs, unlinkContactFromJob } from "./pipeline.js";
import { enrichContact } from "./enrich.js";

function repos(): Repos {
  return buildRepos(getDb());
}

const contactNotFound = () => new DomainError(404, "NOT_FOUND", "Contact not found");

export function listContacts(owner: string, filters: ContactListFilters) {
  return repos().contacts.list(owner, filters);
}

/** POST / — create-or-update by email (manual source). */
export function createContact(owner: string, fields: ContactFields & { lifecycle?: ContactLifecycle }) {
  return upsertContact(repos(), owner, { ...fields, source: "manual" });
}

export function listMergeQueue(owner: string) {
  return repos().personMerge.listPending(owner);
}

/** Approve/reject a pending duplicate pair. */
export async function decideMergeRequest(owner: string, queueId: string, approve: boolean) {
  const outcome = await decideMerge(repos(), owner, queueId, approve);
  if (outcome === "not_found") throw new DomainError(404, "NOT_FOUND", "Merge request not found");
  if (outcome === "stale") throw new DomainError(409, "CONFLICT", "Merge request is no longer pending");
  return outcome;
}

export async function getMergePolicy(owner: string) {
  const { mode, autoThresholdBps } = await resolveMergePolicy(repos(), owner);
  return { mode, autoThresholdBps };
}

export async function setMergePolicy(owner: string, mode: MergePolicyMode, autoThresholdBps: number) {
  const r = repos();
  const workspaceId = await r.personMerge.ensurePersonalWorkspaceId(owner);
  const row = await r.personMerge.upsertPolicy(workspaceId, mode, autoThresholdBps);
  return { mode: row.mode, autoThresholdBps: row.autoThresholdBps };
}

/** One contact + its job links. */
export async function getContact(owner: string, id: string) {
  const r = repos();
  const contact = await r.contacts.findById(owner, id);
  if (!contact) throw contactNotFound();
  const jobs = await listContactJobs(r, owner, contact.id);
  return { ...contact, jobs: jobs ?? [] };
}

/** Owner edit; a duplicate (owner, lower(email)) is a 409. */
export async function editContact(owner: string, id: string, fields: ContactFields & { lifecycle?: ContactLifecycle }) {
  let row;
  try {
    row = await updateContact(repos(), owner, id, fields);
  } catch (err) {
    if (err instanceof Error && /uq_contacts_owner_email|duplicate key/i.test(err.message)) {
      throw new DomainError(409, "CONFLICT", "Another contact already uses this email");
    }
    throw err;
  }
  if (!row) throw contactNotFound();
  return row;
}

export async function deleteContact(owner: string, id: string): Promise<void> {
  if (!(await repos().contacts.delete(owner, id))) throw contactNotFound();
}

/** Spend 1 enrichment credit and fill gaps. */
export async function enrichOwnedContact(owner: string, id: string) {
  const result = await enrichContact(repos(), owner, id);
  if ("reason" in result) {
    if (result.reason === "not_found") throw contactNotFound();
    throw new DomainError(402, "INSUFFICIENT_CREDITS", "No enrichment credits remaining. Purchase a pack to continue.");
  }
  return result;
}

export async function linkJob(owner: string, contactId: string, jobId: string, stage: ContactJobStage) {
  const result = await linkContactToJob({ contacts: repos().contacts, canManageJob }, owner, contactId, jobId, stage);
  if ("reason" in result) {
    if (result.reason === "contact_not_found") throw contactNotFound();
    throw new DomainError(403, "FORBIDDEN", "You can't manage that job's pipeline");
  }
  return result.link;
}

export async function unlinkJob(owner: string, contactId: string, jobId: string): Promise<void> {
  if (!(await unlinkContactFromJob(repos(), owner, contactId, jobId))) throw contactNotFound();
}
