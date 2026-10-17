/**
 * Tests for the notification EMAIL channel (gap #2099 email half): the
 * generic `buildNotificationEmail` builder + the unified dispatcher's
 * opt-in, preference-gated email fan-out in `emitNotification`.
 *
 * Run: node --import tsx --test src/services/__tests__/notification-email-channel.test.ts
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  buildNotificationEmail,
  __setEmailProvider,
  type EmailMessage,
} from "../adapters/email.js";
import { emitNotification } from "../notifications/notificationService.js";

// ---------------------------------------------------------------------------
// buildNotificationEmail — pure
// ---------------------------------------------------------------------------

describe("buildNotificationEmail", () => {
  it("uses the title as the subject and escapes title/message into the body", () => {
    const { subject, html } = buildNotificationEmail({
      title: "New message",
      message: "Alice <b>messaged</b> you",
    });
    assert.equal(subject, "New message");
    assert.match(html, /New message/);
    // The message is HTML-escaped, so the injected tag is neutralised.
    assert.match(html, /Alice &lt;b&gt;messaged&lt;\/b&gt; you/);
    assert.doesNotMatch(html, /<b>messaged<\/b>/);
  });

  it("renders a CTA button for a site-relative url (absolutised)", () => {
    const { html } = buildNotificationEmail({
      title: "Inquiry received",
      message: "You have a new inquiry",
      url: "/services/inquiries",
    });
    assert.match(html, /href="https?:\/\/[^"]*\/services\/inquiries"/);
    assert.match(html, />View</);
  });

  it("passes an absolute http(s) url through unchanged", () => {
    const { html } = buildNotificationEmail({
      title: "T",
      message: "M",
      url: "https://hired.video/feed/abc",
    });
    assert.match(html, /href="https:\/\/hired\.video\/feed\/abc"/);
  });

  it("omits the CTA for a non-http / non-relative url (no javascript: injection)", () => {
    const { html } = buildNotificationEmail({
      title: "T",
      message: "M",
      url: "javascript:alert(1)",
    });
    assert.doesNotMatch(html, />View</);
    assert.doesNotMatch(html, /javascript:/);
  });
});

// ---------------------------------------------------------------------------
// emitNotification email fan-out — opt-in + pref-gated
// ---------------------------------------------------------------------------

/** Minimal fake repos: a notifications sink + a users table for email lookup. */
function fakeDeps(users: Array<{ id: string; email: string | null }>) {
  const inserted: any[] = [];
  return {
    inserted,
    deps: {
      repos: {
        notifications: {
          insertNotifications: async (rows: any[]) => {
            inserted.push(...rows);
          },
          findNotificationsForUser: async () => [],
        },
        users: {
          findManyByIds: async (ids: string[]) =>
            users.filter((u) => ids.includes(u.id)),
        },
      },
    } as any,
  };
}

function spyProvider() {
  const sent: EmailMessage[] = [];
  return {
    sent,
    provider: {
      send: async (m: EmailMessage) => {
        sent.push(m);
      },
    },
  };
}

describe("emitNotification email channel", () => {
  afterEach(() => __setEmailProvider(null));

  it("does NOT email when email is not opted in (default off)", async () => {
    const { sent, provider } = spyProvider();
    __setEmailProvider(provider);
    const { deps, inserted } = fakeDeps([{ id: "u1", email: "u1@example.com" }]);

    await emitNotification(deps, {
      recipientIds: ["u1"],
      type: "message_received",
      actor: null,
      title: "New message",
      // email omitted → opt-out
    });

    assert.equal(inserted.length, 1, "bell row still persisted");
    assert.equal(sent.length, 0, "no email when not opted in");
  });

  it("emails opted-in recipients (prefs unavailable → errs toward sending)", async () => {
    const { sent, provider } = spyProvider();
    __setEmailProvider(provider);
    const { deps } = fakeDeps([{ id: "u1", email: "u1@example.com" }]);

    await emitNotification(deps, {
      recipientIds: ["u1"],
      type: "message_received",
      actor: null,
      title: "New message",
      message: "You have a new message",
      url: "/messages",
      push: false, // isolate the email channel
      email: true,
    });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "u1@example.com");
    assert.equal(sent[0].subject, "New message");
    assert.match(sent[0].html, /You have a new message/);
  });

  it("skips recipients with no email on file", async () => {
    const { sent, provider } = spyProvider();
    __setEmailProvider(provider);
    const { deps } = fakeDeps([{ id: "u1", email: null }]);

    await emitNotification(deps, {
      recipientIds: ["u1"],
      type: "system",
      actor: null,
      title: "Heads up",
      push: false,
      email: true,
    });

    assert.equal(sent.length, 0);
  });

  it("no-ops the email channel entirely when no provider is configured", async () => {
    __setEmailProvider(null); // no provider
    const { deps, inserted } = fakeDeps([{ id: "u1", email: "u1@example.com" }]);

    // Should not throw even though email is opted in.
    await emitNotification(deps, {
      recipientIds: ["u1"],
      type: "system",
      actor: null,
      title: "Heads up",
      push: false,
      email: true,
    });

    assert.equal(inserted.length, 1, "bell row still persisted with no email provider");
  });
});
