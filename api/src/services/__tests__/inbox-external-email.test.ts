import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getInboxFor } from "../messaging/inboxService.js";

/**
 * Unit tests for the external-email branch of the inbox aggregator.
 *
 * Run: node --import tsx --test src/services/__tests__/inbox-external-email.test.ts
 */

const userId = "user-1";

function fakeRepos(externalEmails: any[], accounts: any[] = []) {
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
      findInboxForUser: async () => externalEmails,
    },
    externalEmailAccounts: {
      findAllForUser: async () => accounts,
    },
  } as any;
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

