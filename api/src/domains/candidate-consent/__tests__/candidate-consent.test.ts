/**
 * Candidate video consent use cases against in-memory ports:
 * request → email → respond (approve / decline / revoke), expiry, double
 * respond, wrong token, resend, the approver-email rules, and that every
 * non-approval outcome forces the project unlisted.
 *
 * Run: node --import tsx --test src/domains/candidate-consent/__tests__/candidate-consent.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CandidateConsentError, hashConsentToken } from "../ports.js";
import { listConsents, requestConsent, resendConsent } from "../request-consent.js";
import { getPublicConsent, respondToConsent } from "../respond-consent.js";
import { consentHarness, DAY, POOL_ROW, PROJECT, RECRUITER, STRANGER, T0, VIDEO, type ConsentHarness } from "./fake-consent-deps.js";

let h: ConsentHarness;
beforeEach(() => {
  h = consentHarness();
});

const actor = { userId: RECRUITER };

async function expectKind(p: Promise<unknown>, kind: CandidateConsentError["kind"]) {
  await assert.rejects(p, (e: unknown) => e instanceof CandidateConsentError && e.kind === kind);
}

/** Request for the pool candidate and return the raw emailed token. */
async function requestForPool(): Promise<string> {
  await requestConsent(actor, { projectId: PROJECT, talentPoolCandidateId: POOL_ROW }, h.deps);
  return h.sent.at(-1)!.token;
}

describe("requestConsent", () => {
  it("stores only the token hash, links the subject, emails the raw token", async () => {
    const dto = await requestConsent(actor, { projectId: PROJECT, talentPoolCandidateId: POOL_ROW, message: "Loved our chat!" }, h.deps);
    assert.equal(dto.status, "pending");
    assert.equal(dto.candidateName, "Dana Whitfield");
    assert.equal(dto.candidateEmail, "dana.whitfield@example.com");
    assert.equal(dto.expiresAt, new Date(+T0 + 14 * DAY).toISOString());
    assert.deepEqual([dto.respondedEmail, dto.respondedIp, dto.withdrawnAt], [null, null, null]);
    assert.equal(h.sent.length, 1);
    const token = h.sent[0].token;
    assert.match(token, /^[0-9a-f]{64}$/);
    assert.equal(h.repo.rows[0].tokenHash, await hashConsentToken(token));
    assert.notEqual(h.repo.rows[0].tokenHash, token);
    assert.equal(h.sent[0].recruiterName, "Morgan Reyes");
    assert.equal(h.sent[0].message, "Loved our chat!");
    assert.equal(h.repo.subjects.get(PROJECT), POOL_ROW);
    assert.equal("tokenHash" in dto, false);
  });

  it("forces the project unlisted", async () => {
    await requestForPool();
    assert.deepEqual(h.unlisted, [PROJECT]);
  });

  it("supersedes the earlier pending ask for the project", async () => {
    const first = await requestForPool();
    await requestForPool();
    assert.deepEqual(h.repo.rows.map((r) => r.status), ["revoked", "pending"]);
    await expectKind(getPublicConsent(first, h.deps), "NOT_FOUND");
  });

  it("supersedes an earlier approval too (one live link per project)", async () => {
    const first = await requestForPool();
    await respondToConsent(first, "approve", null, h.deps);
    await requestForPool();
    assert.equal(h.repo.rows[0].status, "revoked");
    await expectKind(respondToConsent(first, "revoke", null, h.deps), "NOT_FOUND");
  });

  it("refuses someone who can't write the project", async () => {
    await expectKind(
      requestConsent({ userId: STRANGER }, { projectId: PROJECT, candidateName: "A", candidateEmail: "a@example.com" }, h.deps),
      "FORBIDDEN",
    );
    assert.equal(h.sent.length, 0);
    assert.deepEqual(h.unlisted, []);
  });

  it("404s a missing project and a pool row the recruiter doesn't own", async () => {
    await expectKind(
      requestConsent(actor, { projectId: "1e2d3c4b-5a69-4788-9a6b-5c4d3e2f1a0b", candidateName: "A", candidateEmail: "a@example.com" }, h.deps),
      "NOT_FOUND",
    );
    h.repo.pool[0].recruiterId = STRANGER;
    await expectKind(requestConsent(actor, { projectId: PROJECT, talentPoolCandidateId: POOL_ROW }, h.deps), "NOT_FOUND");
  });

  it("needs a name + email when there's no pool row to borrow them from", async () => {
    await expectKind(requestConsent(actor, { projectId: PROJECT, candidateName: "Dana" }, h.deps), "VALIDATION");
    h.repo.pool[0].candidateEmail = null;
    await expectKind(requestConsent(actor, { projectId: PROJECT, talentPoolCandidateId: POOL_ROW }, h.deps), "VALIDATION");
  });

  it("keeps the row when the email send fails (the recruiter can resend)", async () => {
    h.deps.sendEmail = async () => {
      throw new Error("provider down");
    };
    const dto = await requestConsent(actor, { projectId: PROJECT, talentPoolCandidateId: POOL_ROW }, h.deps);
    assert.equal(dto.status, "pending");
    assert.equal(h.repo.rows.length, 1);
  });
});

describe("requestConsent — who may approve", () => {
  const ask = (candidateEmail: string, talentPoolCandidateId?: string) =>
    requestConsent(actor, { projectId: PROJECT, talentPoolCandidateId, candidateName: "Dana Whitfield", candidateEmail }, h.deps);

  it("the pool row's email is authoritative: a different one is EMAIL_MISMATCH", async () => {
    await expectKind(ask("someone.else@example.com", POOL_ROW), "EMAIL_MISMATCH");
    assert.equal(h.sent.length, 0);
    // Same address, different case / spacing, is fine.
    await ask("DANA.WHITFIELD@example.com", POOL_ROW);
    assert.equal(h.sent[0].to, "dana.whitfield@example.com");
  });

  it("refuses the recruiter's own email (even on a public provider)", async () => {
    h.repo.identity = { email: "morgan.reyes@gmail.com", companyWebsites: [] };
    await expectKind(ask("Morgan.Reyes@gmail.com"), "EMAIL_NOT_ALLOWED");
  });

  it("refuses the recruiter's own domain and the company's website domain (subdomains too)", async () => {
    await expectKind(ask("dana@northwind-logistics.com"), "EMAIL_NOT_ALLOWED");
    await expectKind(ask("dana@mail.northwind-logistics.com"), "EMAIL_NOT_ALLOWED");
    h.repo.identity = { email: "morgan@recruitco.io", companyWebsites: ["northwind.example.org"] };
    await expectKind(ask("dana@northwind.example.org"), "EMAIL_NOT_ALLOWED");
    assert.equal(h.sent.length, 0);
  });

  it("allows a public mailbox provider the recruiter also uses", async () => {
    h.repo.identity = { email: "morgan.reyes@gmail.com", companyWebsites: ["https://gmail.com"] };
    const dto = await ask("dana.whitfield@gmail.com");
    assert.equal(dto.candidateEmail, "dana.whitfield@gmail.com");
  });
});

describe("getPublicConsent / respondToConsent", () => {
  it("shows the ask, then approves it once, pinning the content and exposing the masked IP", async () => {
    const token = await requestForPool();
    const view = await getPublicConsent(token, h.deps);
    assert.deepEqual(
      { ...view, videoUrl: view.videoUrl?.endsWith("/studio/abc/video.mp4") },
      {
        candidateName: "Dana Whitfield",
        recruiterName: "Morgan Reyes",
        jobTitle: "Senior Data Analyst",
        companyName: "Northwind Logistics",
        videoUrl: true,
        status: "pending",
        expiresAt: new Date(+T0 + 14 * DAY).toISOString(),
      },
    );
    const at = new Date(+T0 + DAY);
    h.setNow(at);
    h.unlisted.length = 0;
    const answered = await respondToConsent(token, "approve", "203.0.113.7", h.deps);
    assert.equal(answered.status, "approved");
    const row = h.repo.rows[0];
    assert.equal(row.responseIp, "203.0.113.7");
    assert.deepEqual(row.respondedAt, at);
    assert.deepEqual([row.approvedVideoId, row.approvedVideoR2Key, row.approvedRevision], [VIDEO, "studio/abc/render-1.mp4", 3]);
    assert.deepEqual(h.unlisted, [], "an approval doesn't unlist");
    const [dto] = await listConsents(actor, PROJECT, h.deps);
    assert.equal(dto.respondedEmail, "dana.whitfield@example.com");
    assert.equal(dto.respondedIp, "203.0.x.x");
  });

  it("masks an IPv6 answer to its first two groups", async () => {
    const token = await requestForPool();
    await respondToConsent(token, "approve", "2001:db8:85a3::8a2e:370:7334", h.deps);
    assert.equal((await listConsents(actor, PROJECT, h.deps))[0].respondedIp, "2001:db8:…");
  });

  it("records a decline and forces the project unlisted", async () => {
    const token = await requestForPool();
    h.unlisted.length = 0;
    assert.equal((await respondToConsent(token, "decline", null, h.deps)).status, "declined");
    assert.deepEqual(h.unlisted, [PROJECT]);
  });

  it("refuses a second answer", async () => {
    const token = await requestForPool();
    await respondToConsent(token, "approve", null, h.deps);
    await expectKind(respondToConsent(token, "decline", null, h.deps), "ALREADY_RESPONDED");
    assert.equal(h.repo.rows[0].status, "approved");
  });

  it("GET reads an expired link as expired without writing; POST persists it and unlists", async () => {
    const token = await requestForPool();
    h.setNow(new Date(+T0 + 14 * DAY + 1));
    assert.equal((await getPublicConsent(token, h.deps)).status, "expired");
    assert.equal(h.repo.rows[0].status, "pending", "GET has no write side effect");
    h.unlisted.length = 0;
    await expectKind(respondToConsent(token, "approve", null, h.deps), "EXPIRED");
    assert.equal(h.repo.rows[0].status, "expired");
    assert.deepEqual(h.unlisted, [PROJECT]);
  });

  it("fails closed on a wrong, malformed or empty token", async () => {
    await requestForPool();
    for (const bad of ["f".repeat(64), "not-a-token", "", "A".repeat(64)]) {
      await expectKind(getPublicConsent(bad, h.deps), "NOT_FOUND");
      await expectKind(respondToConsent(bad, "approve", null, h.deps), "NOT_FOUND");
      await expectKind(respondToConsent(bad, "revoke", null, h.deps), "NOT_FOUND");
    }
  });
});

describe("respondToConsent — revoke (withdraw consent)", () => {
  it("withdraws an approval, unlists the project and keeps showing the state", async () => {
    const token = await requestForPool();
    await respondToConsent(token, "approve", "203.0.113.7", h.deps);
    h.unlisted.length = 0;
    const view = await respondToConsent(token, "revoke", "198.51.100.4", h.deps);
    assert.equal(view.status, "revoked");
    assert.deepEqual(h.unlisted, [PROJECT]);
    const row = h.repo.rows[0];
    assert.ok(row.withdrawnAt);
    assert.equal(row.responseIp, "203.0.113.7", "the approving IP is kept");
    assert.equal((await getPublicConsent(token, h.deps)).status, "revoked");
    const [dto] = await listConsents(actor, PROJECT, h.deps);
    assert.equal(dto.status, "revoked");
    assert.equal(dto.withdrawnAt, new Date(row.withdrawnAt!).toISOString());
  });

  it("works after the link's expiry for as long as the approval stands", async () => {
    const token = await requestForPool();
    await respondToConsent(token, "approve", null, h.deps);
    h.setNow(new Date(+T0 + 90 * DAY));
    assert.equal((await respondToConsent(token, "revoke", null, h.deps)).status, "revoked");
  });

  it("refuses to withdraw what was never approved, or twice", async () => {
    const token = await requestForPool();
    await expectKind(respondToConsent(token, "revoke", null, h.deps), "NOT_APPROVED");
    await respondToConsent(token, "approve", null, h.deps);
    await respondToConsent(token, "revoke", null, h.deps);
    await expectKind(respondToConsent(token, "revoke", null, h.deps), "NOT_APPROVED");
    await expectKind(respondToConsent(token, "approve", null, h.deps), "ALREADY_RESPONDED");
  });
});

describe("resendConsent / listConsents", () => {
  it("re-issues an expired ask with a new token and expiry; the old link dies", async () => {
    const oldToken = await requestForPool();
    const at = new Date(+T0 + 20 * DAY);
    h.setNow(at);
    const dto = await resendConsent(actor, h.repo.rows[0].id, h.deps);
    assert.equal(dto.status, "pending");
    assert.equal(dto.expiresAt, new Date(+at + 14 * DAY).toISOString());
    const newToken = h.sent.at(-1)!.token;
    assert.notEqual(newToken, oldToken);
    await expectKind(getPublicConsent(oldToken, h.deps), "NOT_FOUND");
    assert.equal((await respondToConsent(newToken, "approve", null, h.deps)).status, "approved");
  });

  it("won't resend an answered ask, and checks the project write rule", async () => {
    const token = await requestForPool();
    await respondToConsent(token, "approve", null, h.deps);
    await expectKind(resendConsent(actor, h.repo.rows[0].id, h.deps), "NOT_RESENDABLE");
    await expectKind(resendConsent({ userId: STRANGER }, h.repo.rows[0].id, h.deps), "FORBIDDEN");
    await expectKind(resendConsent(actor, "7f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918", h.deps), "NOT_FOUND");
  });

  it("lists newest first, reporting a lapsed pending ask as expired", async () => {
    await requestForPool();
    h.setNow(new Date(+T0 + DAY));
    await requestForPool();
    h.setNow(new Date(+T0 + 30 * DAY));
    const list = await listConsents(actor, PROJECT, h.deps);
    assert.deepEqual(list.map((c) => c.status), ["expired", "revoked"]);
    await expectKind(listConsents({ userId: STRANGER }, PROJECT, h.deps), "FORBIDDEN");
  });
});
