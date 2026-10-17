import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildConnectionRequestEmail } from "../adapters/email/templates/network.js";

/**
 * Unit tests for the connection-request email template.
 *
 * Run: node --import tsx --test src/services/__tests__/connection-email.test.ts
 */

describe("buildConnectionRequestEmail", () => {
  it("uses sender name in the subject line", () => {
    const msg = buildConnectionRequestEmail({
      to: "alice@example.com",
      recipientName: "Alice",
      senderName: "Bob Smith",
      senderProfileId: "user-123",
    });
    assert.equal(msg.subject, "Bob Smith wants to connect on hired.video");
    assert.equal(msg.to, "alice@example.com");
  });

  it("builds a profile URL from the sender id", () => {
    const msg = buildConnectionRequestEmail({
      to: "alice@example.com",
      recipientName: "Alice",
      senderName: "Bob",
      senderProfileId: "6f6bcee7-3b76-4c10-a7be-675d0b566c64",
    });
    // Profile URL should include the path /people/:id
    assert.ok(
      msg.profileUrl.endsWith("/people/6f6bcee7-3b76-4c10-a7be-675d0b566c64"),
      `expected profile URL to end with /people/<id>, got ${msg.profileUrl}`,
    );
    // The HTML body should embed the same link so the recipient can click through.
    assert.ok(msg.html.includes(msg.profileUrl));
  });

  it("percent-encodes sender ids that contain URL-unsafe chars", () => {
    const msg = buildConnectionRequestEmail({
      to: "a@b.com",
      recipientName: "A",
      senderName: "B",
      senderProfileId: "weird id/with spaces",
    });
    assert.ok(msg.profileUrl.includes("weird%20id%2Fwith%20spaces"));
  });

  it("falls back to a generic body when no message is supplied", () => {
    const msg = buildConnectionRequestEmail({
      to: "a@b.com",
      recipientName: "Alice",
      senderName: "Carol",
      senderProfileId: "x",
    });
    assert.ok(
      msg.html.includes("Carol would like to connect with you."),
      "expected generic fallback line when requestMessage is absent",
    );
  });

  it("falls back when the message is whitespace only", () => {
    const msg = buildConnectionRequestEmail({
      to: "a@b.com",
      recipientName: "Alice",
      senderName: "Dave",
      senderProfileId: "x",
      requestMessage: "   \n  ",
    });
    assert.ok(msg.html.includes("Dave would like to connect with you."));
  });

  it("includes the sender-supplied message verbatim when present", () => {
    const msg = buildConnectionRequestEmail({
      to: "a@b.com",
      recipientName: "Alice",
      senderName: "Eve",
      senderProfileId: "x",
      requestMessage: "Hey — met you at RemoteConf!",
    });
    // HTML-escapes the em-dash/apostrophe, so just assert recognizable fragments.
    assert.ok(msg.html.includes("Hey"));
    assert.ok(msg.html.includes("RemoteConf!"));
  });

  it("escapes HTML in the sender name to prevent injection", () => {
    const msg = buildConnectionRequestEmail({
      to: "a@b.com",
      recipientName: "Alice",
      senderName: "<script>alert(1)</script>",
      senderProfileId: "x",
    });
    // Raw <script> must not appear in the rendered HTML.
    assert.ok(!msg.html.includes("<script>alert(1)</script>"));
    assert.ok(msg.html.includes("&lt;script&gt;"));
  });

  it("escapes HTML in the request message", () => {
    const msg = buildConnectionRequestEmail({
      to: "a@b.com",
      recipientName: "Alice",
      senderName: "Bob",
      senderProfileId: "x",
      requestMessage: "<img src=x onerror=alert(1)>",
    });
    assert.ok(!msg.html.includes("<img src=x onerror=alert(1)>"));
    assert.ok(msg.html.includes("&lt;img"));
  });

  it("renders recipient name in the greeting", () => {
    const msg = buildConnectionRequestEmail({
      to: "a@b.com",
      recipientName: "Jim Beiermeister",
      senderName: "Bob",
      senderProfileId: "x",
    });
    assert.ok(msg.html.includes("Jim Beiermeister"));
  });
});
