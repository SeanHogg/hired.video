/**
 * runSelfPublishGate — the one Lane-B gate (#2044): entitlement (the plan's
 * channel cap, free 2 — a guest session too — → Pro unlimited) → connection →
 * fresh token. The cap runs the REAL rule (canPostToDestination) with its plan
 * and publication lookups stubbed, so free and Pro are each pinned.
 *
 * Run: node --import tsx --test src/services/social/__tests__/self-publish-gate.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runSelfPublishGate } from "../self-publish-gate.js";
import { canPostToDestination } from "../../studio/post-channel-gate.js";

const USER = "8f2c1a9e-4b7d-4e21-9c3a-1d5e6f7a8b9c";
const PROJECT = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";

/** Publication rows shaped like publication-service's records. */
function published(...destinations: string[]) {
  return destinations.map((destination) => ({
    destination,
    externalId: `ext-${destination}`,
    externalUrl: null,
    status: "published",
  }));
}

/** The real cap rule over a stubbed plan + ledger. */
function capFor(plan: { isPro: boolean }, ledger: Array<{ destination: string; status: string }>) {
  return (check: Parameters<typeof canPostToDestination>[0]) =>
    canPostToDestination(check, { isPro: async () => plan.isPro, listPublications: async () => ledger });
}

function tokenSource(token: string | null) {
  const asked: string[] = [];
  return {
    asked,
    selfAccessToken: async (_userId: string, platform: string) => {
      asked.push(platform);
      return token;
    },
  };
}

const account = { userId: USER };

describe("runSelfPublishGate — free account (2 channels per video)", () => {
  it("lets a second channel through and hands back the fresh token", async () => {
    const tokens = tokenSource("yt-fresh");
    const result = await runSelfPublishGate(
      { actor: account, projectId: PROJECT, platform: "youtube" },
      { canPost: capFor({ isPro: false }, published("profile")), selfAccessToken: tokens.selfAccessToken },
    );
    assert.deepEqual(result, { ok: true, accessToken: "yt-fresh" });
    assert.deepEqual(tokens.asked, ["youtube"]);
  });

  it("stops a third channel at the cap without touching the user's tokens", async () => {
    const tokens = tokenSource("tok");
    const result = await runSelfPublishGate(
      { actor: account, projectId: PROJECT, platform: "tiktok" },
      { canPost: capFor({ isPro: false }, published("profile", "youtube")), selfAccessToken: tokens.selfAccessToken },
    );
    assert.deepEqual(result, { ok: false, kind: "CHANNEL_LIMIT" });
    assert.deepEqual(tokens.asked, []);
  });

  it("re-posting to a destination the video is already on never counts twice (boundary)", async () => {
    const result = await runSelfPublishGate(
      { actor: account, projectId: PROJECT, platform: "youtube" },
      { canPost: capFor({ isPro: false }, published("profile", "youtube")), selfAccessToken: tokenSource("t").selfAccessToken },
    );
    assert.equal(result.ok, true);
  });

  it("ignores failed publications when counting channels", async () => {
    const ledger = [...published("profile"), { destination: "x", externalId: null, externalUrl: null, status: "failed" }];
    const result = await runSelfPublishGate(
      { actor: account, projectId: PROJECT, platform: "linkedin" },
      { canPost: capFor({ isPro: false }, ledger), selfAccessToken: tokenSource("t").selfAccessToken },
    );
    assert.equal(result.ok, true);
  });
});

describe("runSelfPublishGate — Pro (unlimited channels)", () => {
  it("posts to a sixth network", async () => {
    const result = await runSelfPublishGate(
      { actor: account, projectId: PROJECT, platform: "facebook" },
      {
        canPost: capFor({ isPro: true }, published("profile", "youtube", "tiktok", "instagram", "x", "linkedin")),
        selfAccessToken: tokenSource("fb-page").selfAccessToken,
      },
    );
    assert.deepEqual(result, { ok: true, accessToken: "fb-page" });
  });

  it("still needs a connection — NOT_CONNECTED when the token source has none", async () => {
    const result = await runSelfPublishGate(
      { actor: account, projectId: PROJECT, platform: "youtube" },
      { canPost: capFor({ isPro: true }, []), selfAccessToken: tokenSource(null).selfAccessToken },
    );
    assert.deepEqual(result, { ok: false, kind: "NOT_CONNECTED" });
  });
});

describe("runSelfPublishGate — errors", () => {
  it("propagates an unexpected token-store failure instead of reporting NOT_CONNECTED", async () => {
    await assert.rejects(
      runSelfPublishGate(
        { actor: account, projectId: PROJECT, platform: "linkedin" },
        {
          canPost: capFor({ isPro: false }, []),
          selfAccessToken: async () => {
            throw new Error("KMS unavailable");
          },
        },
      ),
      /KMS unavailable/,
    );
  });
});
