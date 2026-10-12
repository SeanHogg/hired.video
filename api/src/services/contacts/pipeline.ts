/**
 * Contact ↔ job pipeline links. The owner must be able to manage the job
 * (same rule as every other pipeline surface: services/jobs/jobOwnership).
 */
import type { Repos } from "../../repositories/index.js";
import type { ContactJobLinkRow } from "../../repositories/contactsRepository.js";
import type { ContactJobStage } from "../../../../shared/contacts.js";
import { canViewerManageJob } from "../jobs/jobOwnership.js";

export type PipelineDeps = Pick<Repos, "contacts"> & {
  /** Port over services/jobs/jobOwnership.canViewerManageJob. */
  canManageJob: (userId: string, jobId: string) => Promise<boolean>;
};

/** Production adapter for `canManageJob` (no super-admin bypass, #438). */
export async function canManageJob(userId: string, jobId: string): Promise<boolean> {
  return (await canViewerManageJob(userId, false, jobId))?.canManage ?? false;
}

export type LinkResult =
  | { ok: true; link: ContactJobLinkRow }
  | { ok: false; reason: "contact_not_found" | "job_not_manageable" };

export async function linkContactToJob(
  deps: PipelineDeps,
  ownerUserId: string,
  contactId: string,
  jobId: string,
  stage: ContactJobStage = "sourced",
): Promise<LinkResult> {
  const contact = await deps.contacts.findById(ownerUserId, contactId);
  if (!contact) return { ok: false, reason: "contact_not_found" };
  if (!(await deps.canManageJob(ownerUserId, jobId))) return { ok: false, reason: "job_not_manageable" };
  return { ok: true, link: await deps.contacts.upsertJobLink(contactId, jobId, stage) };
}

export async function listContactJobs(
  deps: Pick<Repos, "contacts">,
  ownerUserId: string,
  contactId: string,
): Promise<ContactJobLinkRow[] | null> {
  const contact = await deps.contacts.findById(ownerUserId, contactId);
  return contact ? deps.contacts.listJobLinks(contactId) : null;
}

export async function unlinkContactFromJob(
  deps: Pick<Repos, "contacts">,
  ownerUserId: string,
  contactId: string,
  jobId: string,
): Promise<boolean> {
  const contact = await deps.contacts.findById(ownerUserId, contactId);
  return contact ? deps.contacts.deleteJobLink(contactId, jobId) : false;
}
