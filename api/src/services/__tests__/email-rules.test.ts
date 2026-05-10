import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyByRules } from "../email-integration/rules.js";
import type { NormalisedEmail } from "../email-integration/providers/types.js";

/** Run: node --import tsx --test src/services/__tests__/email-rules.test.ts */

function mkEmail(overrides: Partial<NormalisedEmail> = {}): NormalisedEmail {
  return {
    providerMessageId: "m-1",
    providerThreadId: null,
    fromEmail: "noreply@example.com",
    fromName: null,
    subject: "",
    snippet: "",
    bodyHtml: null,
    bodyText: "",
    receivedAt: new Date(),
    rawMetadata: {},
    ...overrides,
  };
}

describe("classifyByRules — Stage-1 deterministic classifier", () => {
  it("flags ATS sender domain as application_status", () => {
    const r = classifyByRules(
      mkEmail({ fromEmail: "no-reply@greenhouse.io", subject: "Hello" }),
      [],
    );
    assert.equal(r?.category, "application_status");
    assert.equal(r?.source, "default_rule");
  });

  it("escalates application_status when subject phrasing matches", () => {
    const r = classifyByRules(
      mkEmail({
        fromEmail: "team@acme.com",
        subject: "Thank you for applying to Senior Engineer",
      }),
      [],
    );
    assert.equal(r?.category, "application_status");
    assert.ok((r?.score ?? 0) >= 0.85);
  });

  it("detects interview invites in the subject", () => {
    const r = classifyByRules(
      mkEmail({ fromEmail: "recruiter@acme.com", subject: "Interview with Acme — Wed 2pm" }),
      [],
    );
    assert.equal(r?.category, "interview_invite");
  });

  it("detects offer phrasing anywhere", () => {
    const r = classifyByRules(
      mkEmail({
        fromEmail: "hr@acme.com",
        subject: "Great news",
        bodyText: "We are pleased to offer you the position of Senior Engineer.",
      }),
      [],
    );
    assert.equal(r?.category, "offer");
  });

  it("detects rejection phrasing in body", () => {
    const r = classifyByRules(
      mkEmail({
        fromEmail: "no-reply@lever.co",
        subject: "Update on your application",
        bodyText: "Unfortunately, we will not be moving forward with your application.",
      }),
      [],
    );
    assert.equal(r?.category, "rejection");
  });

  it("user rules override defaults", () => {
    const userRule = {
      id: "rule-1",
      userId: "user-1",
      name: "Mark spammy domain",
      conditions: [{ field: "from_domain", op: "ends_with", value: "spamster.io" }],
      actionCategory: "spam",
      actionScore: "1",
      isEnabled: true,
      priority: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // greenhouse.io would otherwise be application_status; user rule
    // wins because we evaluate user rules first.
    const r = classifyByRules(
      mkEmail({ fromEmail: "blast@spamster.io", subject: "URGENT" }),
      [userRule as any],
    );
    assert.equal(r?.category, "spam");
    assert.equal(r?.source, "user_rule");
  });

  it("returns null when nothing matches", () => {
    const r = classifyByRules(
      mkEmail({
        fromEmail: "alice@friend.com",
        subject: "Lunch tomorrow?",
        bodyText: "Want to grab pho around 12:30?",
      }),
      [],
    );
    assert.equal(r, null);
  });
});
