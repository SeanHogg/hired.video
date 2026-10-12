/**
 * Contacts graph — duplicate scoring (shared/contacts.ts) and the upsert →
 * reconcile → merge/queue → decide flow (services/contacts/) against
 * in-memory repositories.
 *
 * Run: node --import tsx --test src/services/contacts/__tests__/contacts.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { duplicateConfidenceBps, mergeDecision, normalizeEmail } from "../../../../../shared/contacts.js";
import { upsertContact, updateContact, type UpsertDeps } from "../upsert.js";
import { decideMerge } from "../merge.js";
import { linkContactToJob } from "../pipeline.js";
import type { ContactRow, ContactJobLinkRow, IContactsRepository } from "../../../repositories/contactsRepository.js";
import type { IPersonMergeRepository, PersonMergeQueueRow, MergeQueueInsert } from "../../../repositories/personMergeRepository.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER_OWNER = "22222222-2222-4222-8222-222222222222";

function fakeContacts(): IContactsRepository & { rows: ContactRow[]; links: ContactJobLinkRow[] } {
  const rows: ContactRow[] = [];
  const links: ContactJobLinkRow[] = [];
  const byOwner = (owner: string) => rows.filter((r) => r.ownerUserId === owner);
  return {
    rows,
    links,
    async findById(owner, id) {
      return byOwner(owner).find((r) => r.id === id) ?? null;
    },
    async findByEmail(owner, email) {
      return byOwner(owner).find((r) => r.email?.toLowerCase() === email.toLowerCase()) ?? null;
    },
    async list(owner) {
      return byOwner(owner);
    },
    async findDuplicateCandidates(owner, excludeId, probe) {
      return byOwner(owner).filter(
        (r) =>
          r.id !== excludeId &&
          ((probe.fullName && r.fullName?.toLowerCase() === probe.fullName.toLowerCase()) ||
            (probe.phone && r.phone === probe.phone) ||
            (probe.linkedinUrl && r.linkedinUrl === probe.linkedinUrl)),
      );
    },
    async insert(input) {
      if (input.email && rows.some((r) => r.ownerUserId === input.ownerUserId && r.email?.toLowerCase() === input.email!.toLowerCase())) {
        throw new Error("duplicate key value violates unique constraint uq_contacts_owner_email");
      }
      const now = new Date();
      const row = {
        id: randomUUID(), email: null, fullName: null, company: null, title: null, phone: null,
        linkedinUrl: null, linkedUserId: null, lifecycle: "contact", source: "manual", notes: null,
        enrichedAt: null, createdAt: now, updatedAt: now, ...input,
      } as ContactRow;
      rows.push(row);
      return row;
    },
    async update(owner, id, patch) {
      const row = byOwner(owner).find((r) => r.id === id);
      if (!row) return null;
      Object.assign(row, patch, { updatedAt: new Date() });
      return row;
    },
    async delete(owner, id) {
      const i = rows.findIndex((r) => r.ownerUserId === owner && r.id === id);
      if (i < 0) return false;
      rows.splice(i, 1);
      for (let j = links.length - 1; j >= 0; j -= 1) if (links[j].contactId === id) links.splice(j, 1);
      return true;
    },
    async listJobLinks(contactId) {
      return links.filter((l) => l.contactId === contactId);
    },
    async upsertJobLink(contactId, jobId, stage) {
      const existing = links.find((l) => l.contactId === contactId && l.jobId === jobId);
      if (existing) return Object.assign(existing, { stage });
      const now = new Date();
      const link = { id: randomUUID(), contactId, jobId, stage, createdAt: now, updatedAt: now } as ContactJobLinkRow;
      links.push(link);
      return link;
    },
    async updateJobLinkStage(contactId, jobId, stage) {
      const l = links.find((x) => x.contactId === contactId && x.jobId === jobId);
      return l ? Object.assign(l, { stage }) : null;
    },
    async deleteJobLink(contactId, jobId) {
      const i = links.findIndex((x) => x.contactId === contactId && x.jobId === jobId);
      if (i < 0) return false;
      links.splice(i, 1);
      return true;
    },
    async moveJobLinks(from, to) {
      const taken = new Set(links.filter((l) => l.contactId === to).map((l) => l.jobId));
      for (const l of links) if (l.contactId === from && !taken.has(l.jobId)) l.contactId = to;
    },
  };
}

function fakeMerge(policy?: { mode: string; autoThresholdBps: number }): IPersonMergeRepository & { queue: PersonMergeQueueRow[] } {
  const queue: PersonMergeQueueRow[] = [];
  return {
    queue,
    async findPersonalWorkspaceId() { return policy ? "ws-1" : null; },
    async ensurePersonalWorkspaceId() { return "ws-1"; },
    async findPolicy() {
      return policy ? ({ workspaceId: "ws-1", ...policy, updatedAt: new Date() }) : null;
    },
    async upsertPolicy(workspaceId, mode, autoThresholdBps) {
      return { workspaceId, mode, autoThresholdBps, updatedAt: new Date() };
    },
    async enqueue(row: MergeQueueInsert) {
      if (queue.some((q) => q.targetPersonId === row.targetPersonId && q.sourcePersonId === row.sourcePersonId)) return null;
      const r = { id: randomUUID(), decidedAt: null, decidedBy: null, createdAt: new Date(), ...row } as PersonMergeQueueRow;
      queue.push(r);
      return r;
    },
    async listPending(owner) { return queue.filter((q) => q.ownerUserId === owner && q.status === "pending"); },
    async findById(owner, id) { return queue.find((q) => q.ownerUserId === owner && q.id === id) ?? null; },
    async decide(id, status, decidedBy) {
      const q = queue.find((x) => x.id === id);
      if (q) Object.assign(q, { status, decidedBy, decidedAt: new Date() });
    },
  };
}

function deps(policy?: { mode: string; autoThresholdBps: number }, platformEmails: Record<string, string> = {}) {
  const contacts = fakeContacts();
  const personMerge = fakeMerge(policy);
  const users = {
    async findByEmail(email: string) {
      return platformEmails[email] ? { id: platformEmails[email] } : null;
    },
  } as unknown as UpsertDeps["users"];
  return { contacts, personMerge, users };
}

describe("shared/contacts — duplicate scoring", () => {
  it("normalizes emails and rejects non-emails", () => {
    assert.equal(normalizeEmail("  Jane@Acme.COM "), "jane@acme.com");
    assert.equal(normalizeEmail("not-an-email"), null);
    assert.equal(normalizeEmail(null), null);
  });

  it("ranks LinkedIn > phone > name+company > name+corporate domain", () => {
    assert.equal(
      duplicateConfidenceBps({ linkedinUrl: "https://www.linkedin.com/in/jane-doe/" }, { linkedinUrl: "linkedin.com/in/Jane-Doe?trk=x" }),
      10000,
    );
    assert.equal(duplicateConfidenceBps({ phone: "+1 (415) 555-0100" }, { phone: "415.555.0100" }), 9500);
    assert.equal(duplicateConfidenceBps({ fullName: "Jane Doe", company: "Acme, Inc." }, { fullName: "jane doe", company: "ACME Inc" }), 9000);
    assert.equal(duplicateConfidenceBps({ fullName: "Jane Doe", email: "jane@acme.com" }, { fullName: "Jane Doe", email: "j.doe@acme.com" }), 8500);
  });

  it("never matches on a free-mail domain or a name alone", () => {
    assert.equal(duplicateConfidenceBps({ fullName: "Jane Doe", email: "a@gmail.com" }, { fullName: "Jane Doe", email: "b@gmail.com" }), 0);
    assert.equal(duplicateConfidenceBps({ fullName: "Jane Doe" }, { fullName: "Jane Doe" }), 0);
    assert.equal(duplicateConfidenceBps({ fullName: "Jane Doe", company: "Acme" }, { fullName: "John Doe", company: "Acme" }), 0);
  });

  it("decides auto vs review vs ignore from the policy", () => {
    const auto = { mode: "auto" as const, autoThresholdBps: 9500 };
    assert.equal(mergeDecision(10000, auto), "auto");
    assert.equal(mergeDecision(9000, auto), "review");
    assert.equal(mergeDecision(7999, auto), "ignore");
    assert.equal(mergeDecision(10000, { mode: "review", autoThresholdBps: 9500 }), "review");
  });
});

describe("services/contacts — upsert + reconcile", () => {
  it("creates, then updates the same email case-insensitively without clobbering", async () => {
    const d = deps();
    const first = await upsertContact(d, OWNER, { email: "Jane@Acme.com", fullName: "Jane Doe", source: "manual" });
    assert.equal(first.created, true);
    assert.equal(first.contact.email, "jane@acme.com");
    const second = await upsertContact(d, OWNER, { email: "jane@acme.com", fullName: "J. Doe", title: "CTO", source: "inbox" });
    assert.equal(second.created, false);
    assert.equal(second.contact.id, first.contact.id);
    assert.equal(second.contact.fullName, "Jane Doe", "existing value wins on automatic upserts");
    assert.equal(second.contact.title, "CTO", "missing fields are filled");
    assert.equal(d.contacts.rows.length, 1);
  });

  it("keeps owners isolated", async () => {
    const d = deps();
    await upsertContact(d, OWNER, { email: "jane@acme.com", source: "manual" });
    const other = await upsertContact(d, OTHER_OWNER, { email: "jane@acme.com", source: "manual" });
    assert.equal(other.created, true);
    assert.equal(d.contacts.rows.length, 2);
  });

  it("links the platform user with the same email", async () => {
    const d = deps(undefined, { "jane@acme.com": "user-42" });
    const r = await upsertContact(d, OWNER, { email: "JANE@acme.com", source: "inbox" });
    assert.equal(r.contact.linkedUserId, "user-42");
  });

  it("requires an email or a name", async () => {
    await assert.rejects(upsertContact(deps(), OWNER, { company: "Acme", source: "manual" }));
  });

  it("auto-merges a high-confidence duplicate into the older contact (default policy)", async () => {
    const d = deps();
    const older = await upsertContact(d, OWNER, { email: "jane@acme.com", fullName: "Jane Doe", phone: "415-555-0100", source: "manual" });
    await d.contacts.upsertJobLink(older.contact.id, "job-1", "sourced");
    const dup = await upsertContact(d, OWNER, { email: "jane.doe@gmail.com", fullName: "Jane Doe", phone: "(415) 555 0100", title: "VP Eng", source: "inbox" });
    assert.equal(dup.reconcile.kind, "merged");
    assert.equal(dup.contact.id, older.contact.id);
    assert.equal(dup.contact.title, "VP Eng");
    assert.equal(d.contacts.rows.length, 1);
    assert.equal(d.contacts.links.length, 1);
  });

  it("queues a mid-confidence duplicate, never re-queues it, and merges on approval", async () => {
    const d = deps();
    const older = await upsertContact(d, OWNER, { email: "jane@acme.com", fullName: "Jane Doe", company: "Acme", source: "manual" });
    const dup = await upsertContact(d, OWNER, { email: "jdoe@other.io", fullName: "Jane Doe", company: "Acme", source: "inbox" });
    assert.equal(dup.reconcile.kind, "queued");
    assert.equal(d.contacts.rows.length, 2);
    assert.equal(d.personMerge.queue.length, 1);

    const queueId = d.personMerge.queue[0].id;
    assert.equal(await decideMerge(d, OTHER_OWNER, queueId, true), "not_found");
    assert.equal(await decideMerge(d, OWNER, queueId, true), "merged");
    assert.equal(d.contacts.rows.length, 1);
    assert.equal(d.contacts.rows[0].id, older.contact.id);
    assert.equal(await decideMerge(d, OWNER, queueId, true), "stale");
  });

  it("a rejected pair stays rejected", async () => {
    const d = deps({ mode: "review", autoThresholdBps: 9500 });
    await upsertContact(d, OWNER, { email: "jane@acme.com", fullName: "Jane Doe", company: "Acme", source: "manual" });
    await upsertContact(d, OWNER, { email: "jdoe@other.io", fullName: "Jane Doe", company: "Acme", source: "inbox" });
    const queueId = d.personMerge.queue[0].id;
    assert.equal(await decideMerge(d, OWNER, queueId, false), "rejected");
    assert.equal(d.contacts.rows.length, 2);
    assert.equal(d.personMerge.queue[0].status, "rejected");
  });

  it("owner edits replace values and re-link on email change", async () => {
    const d = deps(undefined, { "new@acme.com": "user-7" });
    const r = await upsertContact(d, OWNER, { email: "old@acme.com", fullName: "Jane", source: "manual" });
    const updated = await updateContact(d, OWNER, r.contact.id, { fullName: "Jane Doe", email: "NEW@acme.com" });
    assert.equal(updated?.fullName, "Jane Doe");
    assert.equal(updated?.email, "new@acme.com");
    assert.equal(updated?.linkedUserId, "user-7");
  });
});

describe("services/contacts — pipeline links", () => {
  it("links only to jobs the owner can manage, and upserts the stage", async () => {
    const d = deps();
    const { contact } = await upsertContact(d, OWNER, { email: "c@x.io", source: "manual" });
    const canManageJob = async (_u: string, jobId: string) => jobId === "mine";
    const denied = await linkContactToJob({ contacts: d.contacts, canManageJob }, OWNER, contact.id, "theirs");
    assert.deepEqual(denied, { ok: false, reason: "job_not_manageable" });
    const ok = await linkContactToJob({ contacts: d.contacts, canManageJob }, OWNER, contact.id, "mine", "sourced");
    assert.equal(ok.ok, true);
    await linkContactToJob({ contacts: d.contacts, canManageJob }, OWNER, contact.id, "mine", "interviewing");
    assert.equal(d.contacts.links.length, 1);
    assert.equal(d.contacts.links[0].stage, "interviewing");
    const missing = await linkContactToJob({ contacts: d.contacts, canManageJob }, OTHER_OWNER, contact.id, "mine");
    assert.deepEqual(missing, { ok: false, reason: "contact_not_found" });
  });
});
