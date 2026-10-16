/**
 * The candidate-video publish gate and its write-side twin:
 * assertCandidateConsent (no subject / subject without an ask / pending /
 * declined / approved / content changed after approval / another candidate)
 * and enforceCandidateConsent (linking a candidate forces unlisted; an
 * approved, unchanged video stays as it is).
 *
 * Run: node --import tsx --test src/domains/candidate-consent/__tests__/consent-gate.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { requestConsent } from "../request-consent.js";
import { respondToConsent } from "../respond-consent.js";
import { assertCandidateConsent, CandidateConsentRequiredError, enforceCandidateConsent } from "../consent-gate.js";
import { consentHarness, DAY, OTHER_POOL_ROW, POOL_ROW, PROJECT, RECRUITER, T0, type ConsentHarness } from "./fake-consent-deps.js";

let h: ConsentHarness;
beforeEach(() => {
  h = consentHarness();
});

async function requestForPool(): Promise<string> {
  await requestConsent({ userId: RECRUITER }, { projectId: PROJECT, talentPoolCandidateId: POOL_ROW }, h.deps);
  return h.sent.at(-1)!.token;
}

async function approved(): Promise<void> {
  await respondToConsent(await requestForPool(), "approve", null, h.deps);
}

const gate = () => assertCandidateConsent(PROJECT, h.repo, h.deps.now());

async function expectBlocked(reason: CandidateConsentRequiredError["reason"]) {
  await assert.rejects(gate(), (e: unknown) =>
    e instanceof CandidateConsentRequiredError && e.code === "CONSENT_REQUIRED" && e.reason === reason
      && (e.details as { reason: string }).reason === reason);
}

describe("assertCandidateConsent (publish gate)", () => {
  it("is a no-op for a project with no candidate subject and no ask", async () => {
    await gate();
  });

  it("blocks a candidate video until the latest ask is approved", async () => {
    h.repo.subjects.set(PROJECT, POOL_ROW);
    await expectBlocked("not_requested");
    const token = await requestForPool();
    await expectBlocked("pending");
    await respondToConsent(token, "approve", null, h.deps);
    await gate();
  });

  it("stays blocked after a decline, an expiry and a withdrawal", async () => {
    let token = await requestForPool();
    await respondToConsent(token, "decline", null, h.deps);
    await expectBlocked("declined");

    await requestForPool();
    h.setNow(new Date(+T0 + 15 * DAY));
    await expectBlocked("expired");

    h.setNow(T0);
    token = await requestForPool();
    await respondToConsent(token, "approve", null, h.deps);
    await gate();
    await respondToConsent(token, "revoke", null, h.deps);
    await expectBlocked("revoked");
  });

  it("unlinking the subject can't bypass an ask that was never approved", async () => {
    await requestForPool();
    h.repo.subjects.delete(PROJECT);
    await expectBlocked("pending");
  });

  it("a newer pending ask supersedes an earlier approval", async () => {
    await approved();
    h.setNow(new Date(+T0 + DAY));
    await requestForPool();
    await expectBlocked("pending");
  });

  it("refuses with content_changed once the approved render is replaced", async () => {
    await approved();
    // A re-render reuses the videos row with a new file.
    h.repo.content.set(PROJECT, { ...h.repo.content.get(PROJECT)!, videoR2Key: "studio/abc/render-2.mp4" });
    await expectBlocked("content_changed");
  });

  it("an approval of an unrendered project is pinned to its revision, and a later render changes it", async () => {
    h.repo.content.set(PROJECT, { videoId: null, videoR2Key: null, revision: 7 });
    await approved();
    await gate();
    h.repo.content.set(PROJECT, { videoId: null, videoR2Key: null, revision: 8 });
    await expectBlocked("content_changed");
    h.repo.content.set(PROJECT, { videoId: "v", videoR2Key: "studio/abc/first-render.mp4", revision: 7 });
    await expectBlocked("content_changed");
  });

  it("an approval by one candidate doesn't cover a video now about another", async () => {
    await approved();
    h.repo.subjects.set(PROJECT, OTHER_POOL_ROW);
    await expectBlocked("not_requested");
  });
});

describe("enforceCandidateConsent", () => {
  const enforce = () => enforceCandidateConsent(PROJECT, { repo: h.repo, forceUnlisted: h.deps.forceUnlisted, now: h.deps.now });

  it("linking a talent_pool_candidate subject forces the project unlisted", async () => {
    h.repo.subjects.set(PROJECT, POOL_ROW);
    assert.equal(await enforce(), true);
    assert.deepEqual(h.unlisted, [PROJECT]);
  });

  it("leaves an ordinary project alone", async () => {
    assert.equal(await enforce(), false);
    assert.deepEqual(h.unlisted, []);
  });

  it("leaves an approved, unchanged video alone; forces it once the content changes", async () => {
    await approved();
    h.unlisted.length = 0;
    assert.equal(await enforce(), false);
    h.repo.content.set(PROJECT, { ...h.repo.content.get(PROJECT)!, videoR2Key: "studio/abc/render-2.mp4" });
    assert.equal(await enforce(), true);
    assert.deepEqual(h.unlisted, [PROJECT]);
  });
});
