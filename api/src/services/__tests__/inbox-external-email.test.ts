import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decodeEmailCursor,
  encodeEmailCursor,
  getInboxFor,
} from "../messaging/inboxService.js";

/**
 * Unit tests for the external-email branch of the inbox aggregator.
 *
 * Run: node --import tsx --test src/services/__tests__/inbox-external-email.test.ts
 */

const userId = "user-1";

function fakeRepos(
  externalEmails: any[],
  accounts: any[] = [],
  opts: { capturedFindOpts?: { value: any } } = {},
) {
  return {
    users: {
      findActorsByIds: async () => [],
      findConnectionsForUser: async () => [],
    },
    notifications: {
      findNotificationsForUser: async () => [],
    },
    conversations: {
      findConversationsForUser: async () => [],
      findLatestMessagePerConversation: async () => [],
      findParticipantUserIds: async () => [],
      countUnreadPerConversation: async () => new Map<string, number>(),
    },
    externalEmailMessages: {
      findRecentForUser: async () => externalEmails,
      findInboxForUser: async (_uid: string, findOpts: any) => {
        if (opts.capturedFindOpts) opts.capturedFindOpts.value = findOpts;
        const limit = findOpts?.limit ?? externalEmails.length;
        return externalEmails.slice(0, limit);
      },
    },
    externalEmailAccounts: {
      findAllForUser: async () => accounts,
    },
  } as any;
}

function fakeEmail(id: string, receivedAt: Date): any {
  return {
    id,
    userId,
    accountId: "acc-1",
    provider: "gmail",
    providerMessageId: `gmail-${id}`,
    providerThreadId: null,
    fromEmail: "recruiter@acme.com",
    fromName: "Acme",
    subject: `subject ${id}`,
    snippet: "preview",
    bodyHtml: null,
    bodyText: null,
    receivedAt,
    category: "job_opportunity",
    score: "0.900",
    summary: "summary",
    linkedJobId: null,
    isRead: false,
    isArchived: false,
    rawMetadata: null,
    createdAt: receivedAt,
    updatedAt: receivedAt,
    accountLabel: "Work",
    accountEmail: "user@example.com",
  };
}

describe("getInboxFor — external email branch", () => {
  it("returns an empty externalEmails array when no integrations are connected", async () => {
    const repos = fakeRepos([]);
    const inbox = await getInboxFor({ repos }, userId);
    assert.deepEqual(inbox.externalEmails, []);
    // Other streams must keep their existing shape — empty arrays, not undefined.
    assert.deepEqual(inbox.conversations, []);
    assert.deepEqual(inbox.notifications, []);
    assert.deepEqual(inbox.pendingRequests, []);
    assert.deepEqual(inbox.accounts, []);
  });

  it("maps a synced email row to the wire DTO with provider + accountLabel", async () => {
    const receivedAt = new Date("2026-05-09T12:00:00Z");
    const repos = fakeRepos([
      {
        id: "msg-1",
        userId,
        accountId: "acc-1",
        provider: "gmail",
        providerMessageId: "gmail-abc",
        providerThreadId: null,
        fromEmail: "recruiter@acme.com",
        fromName: "Acme Recruiter",
        subject: "Senior Engineer @ Acme",
        snippet: "We loved your profile…",
        bodyHtml: null,
        bodyText: null,
        receivedAt,
        category: "job_opportunity",
        score: "0.920",                   // numeric column comes back as a string
        summary: "Inbound recruiter pitch — senior engineer role at Acme",
        linkedJobId: null,
        isRead: false,
        isArchived: false,
        rawMetadata: null,
        createdAt: receivedAt,
        updatedAt: receivedAt,
        accountLabel: "Work",
        accountEmail: "user@example.com",
      },
    ]);

    const inbox = await getInboxFor({ repos }, userId);
    assert.equal(inbox.externalEmails.length, 1);
    const e = inbox.externalEmails[0];
    assert.equal(e.id, "msg-1");
    assert.equal(e.provider, "gmail");
    assert.equal(e.accountLabel, "Work");
    assert.equal(e.fromEmail, "recruiter@acme.com");
    assert.equal(e.fromName, "Acme Recruiter");
    assert.equal(e.subject, "Senior Engineer @ Acme");
    assert.equal(e.category, "job_opportunity");
    assert.equal(e.score, 0.92, "numeric string must coerce to a real number");
    assert.equal(e.summary, "Inbound recruiter pitch — senior engineer role at Acme");
    assert.equal(e.linkedJobId, null);
    assert.equal(e.isRead, false);
    assert.equal(e.receivedAt, receivedAt.toISOString());
  });

  it("returns nextEmailCursor when more than 50 rows are available", async () => {
    // Repo returns limit+1 = 51 rows; service trims to 50 and emits a
    // cursor pinned to the 50th row.
    const baseTime = new Date("2026-05-09T12:00:00Z").getTime();
    const rows = Array.from({ length: 51 }, (_, i) =>
      fakeEmail(`msg-${String(i).padStart(2, "0")}`, new Date(baseTime - i * 60_000)),
    );
    const captured: { value: any } = { value: null };
    const repos = fakeRepos(rows, [], { capturedFindOpts: captured });

    const inbox = await getInboxFor({ repos }, userId);
    assert.equal(inbox.externalEmails.length, 50);
    assert.ok(inbox.nextEmailCursor, "expected a non-null nextEmailCursor");
    // Repo was asked for 51 rows (limit + 1 sentinel).
    assert.equal(captured.value.limit, 51);
    // Cursor anchors to the 50th row's (receivedAt, id).
    const lastReturned = inbox.externalEmails[49];
    const decoded = decodeEmailCursor(inbox.nextEmailCursor);
    assert.deepEqual(decoded, {
      receivedAt: lastReturned.receivedAt,
      id: lastReturned.id,
    });
  });

  it("returns nextEmailCursor=null when the chunk hits the end of the stream", async () => {
    const baseTime = new Date("2026-05-09T12:00:00Z").getTime();
    const rows = Array.from({ length: 10 }, (_, i) =>
      fakeEmail(`msg-${i}`, new Date(baseTime - i * 60_000)),
    );
    const repos = fakeRepos(rows);
    const inbox = await getInboxFor({ repos }, userId);
    assert.equal(inbox.externalEmails.length, 10);
    assert.equal(inbox.nextEmailCursor, null);
  });

  it("decodeEmailCursor round-trips an encoded anchor and rejects malformed input", () => {
    const encoded = encodeEmailCursor("2026-05-09T12:00:00.000Z", "uuid-123");
    assert.deepEqual(decodeEmailCursor(encoded), {
      receivedAt: "2026-05-09T12:00:00.000Z",
      id: "uuid-123",
    });
    assert.equal(decodeEmailCursor(null), undefined);
    assert.equal(decodeEmailCursor(""), undefined);
    assert.equal(decodeEmailCursor("no-separator"), undefined);
  });

  it("falls back to the mailbox address when accountLabel is blank", async () => {
    const receivedAt = new Date("2026-05-09T12:00:00Z");
    const repos = fakeRepos([
      {
        id: "msg-2",
        userId,
        accountId: "acc-2",
        provider: "outlook",
        providerMessageId: "ms-xyz",
        providerThreadId: null,
        fromEmail: "noreply@greenhouse.io",
        fromName: null,
        subject: "Application received",
        snippet: "Thanks for applying",
        bodyHtml: null,
        bodyText: null,
        receivedAt,
        category: null,
        score: null,
        summary: null,
        linkedJobId: null,
        isRead: true,
        isArchived: false,
        rawMetadata: null,
        createdAt: receivedAt,
        updatedAt: receivedAt,
        accountLabel: "   ",                 // whitespace-only
        accountEmail: "candidate@outlook.com",
      },
    ]);

    const inbox = await getInboxFor({ repos }, userId);
    const e = inbox.externalEmails[0];
    assert.equal(e.accountLabel, "candidate@outlook.com");
    // Pre-classifier values stay null on the wire — frontend handles the gap.
    assert.equal(e.category, null);
    assert.equal(e.score, null);
    assert.equal(e.summary, null);
  });
});

