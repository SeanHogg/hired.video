/**
 * Tests for the contact-inquiry confirmation email builder
 * (`buildContactConfirmationEmail`) — the receipt sent to a visitor who
 * submits the shared <ContactPanel> form (Pricing "Request a demo", etc.).
 *
 * Pins the contract the route relies on: the submitter's own subject +
 * message are echoed back (their durable copy), HTML is escaped (the
 * message is untrusted free text), line breaks are preserved, and a blank
 * name degrades to a neutral greeting rather than "Hi ,".
 *
 * Run: node --import tsx --test src/services/__tests__/contact-confirmation-email.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildContactConfirmationEmail } from "../adapters/email.js";

describe("buildContactConfirmationEmail", () => {
  const base = {
    to: "lead@example.com",
    recipientName: "Sean Hogg",
    inquiryLabel: "Demo request",
    subject: "Demo request",
    message: "We're a team of 12 and want a walkthrough.",
  };

  it("echoes the submitter's subject and message back to them", () => {
    const { html } = buildContactConfirmationEmail(base);
    assert.ok(html.includes("Demo request"));
    // escapeHtml escapes & < > " but not the apostrophe, so the message
    // echoes back verbatim.
    assert.ok(html.includes("We're a team of 12 and want a walkthrough."));
  });

  it("uses a fixed, brand-stamped subject line", () => {
    const { subject } = buildContactConfirmationEmail(base);
    assert.equal(subject, "We've received your message – hired.video");
  });

  it("lower-cases the inquiry label for the body sentence", () => {
    const { html } = buildContactConfirmationEmail(base);
    assert.ok(html.includes("received your demo request"));
  });

  it("HTML-escapes untrusted message content (no raw markup injection)", () => {
    const { html } = buildContactConfirmationEmail({
      ...base,
      message: '<script>alert("xss")</script>',
    });
    assert.ok(!html.includes("<script>alert"));
    assert.ok(html.includes("&lt;script&gt;"));
  });

  it("preserves message line breaks via pre-wrap (multi-line copy stays legible)", () => {
    const { html } = buildContactConfirmationEmail({
      ...base,
      message: "Line one\nLine two",
    });
    assert.ok(html.includes("white-space: pre-wrap"));
    assert.ok(html.includes("Line one\nLine two"));
  });

  it("falls back to a neutral greeting when the name is blank", () => {
    const { html } = buildContactConfirmationEmail({ ...base, recipientName: "  " });
    assert.ok(html.includes("Hi there,"));
    assert.ok(!html.includes("Hi ,"));
  });
});
