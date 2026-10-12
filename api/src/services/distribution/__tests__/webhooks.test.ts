/**
 * Inbound social webhooks (#2048): each network's signature scheme accepts
 * a correctly signed delivery and refuses a tampered body, a wrong secret,
 * a missing header and (TikTok) a stale timestamp; the subscription
 * handshakes answer what each network expects; deliveries are reduced to
 * the posts they name; and an unconfigured secret refuses everything.
 *
 * Signatures in the fixtures are computed independently with node:crypto,
 * so the WebCrypto implementation is checked against a second one.
 *
 * Run: node --import tsx --test src/services/distribution/__tests__/webhooks.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handshakeReply, verifyDelivery, type SignedRequest } from "../metrics/webhook-signatures.js";
import { parseWebhookEvents } from "../metrics/webhook-events.js";
import { checkDelivery, ingestDelivery } from "../metrics/ingest-webhook.js";

const SECRET = "a3f9c27e6b1d4e8f90ab12cd34ef5678";
const NOW_SEC = 1760192700; // 2026-10-11T14:25:00Z

const IG_COMMENT = JSON.stringify({
  object: "instagram",
  entry: [{ id: "17841400000000000", time: 1760192690, changes: [{ field: "comments", value: { id: "17865799348089039", text: "Love this!", media: { id: "18027939643230671", media_product_type: "REELS" } } }] }],
});
const TIKTOK_PUBLIC = JSON.stringify({
  client_key: "awq0x1y2z3",
  event: "post.publish.publicly_available",
  create_time: NOW_SEC - 5,
  user_openid: "_000Hqnyyz5UYb9ZhoBcVvWb",
  content: JSON.stringify({ publish_id: "v_pub_url~v2-1.7429184417062718726", publish_type: "DIRECT_PUBLISH", post_id: "7429184417062718726" }),
});
const X_LIKE = JSON.stringify({
  for_user_id: "1557700000000000000",
  favorite_events: [{ id: "a7c1", favorited_status: { id_str: "1844417062718726000", text: "My video pitch" } }],
});
const LINKEDIN_ACTION = JSON.stringify({
  type: "ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS",
  notifications: [{ action: "LIKE", sourcePost: "urn:li:share:7247000000000000000", organizationalEntity: "urn:li:organization:1000" }],
});
const YOUTUBE_ATOM = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <entry><id>yt:video:Ks-_Mh1QhMc</id><yt:videoId>Ks-_Mh1QhMc</yt:videoId><yt:channelId>UCabc123</yt:channelId><title>Maya Chen — Product Designer</title></entry>
</feed>`;

const hex = (alg: "sha256" | "sha1", key: string, msg: string) => createHmac(alg, key).update(msg).digest("hex");
const b64 = (key: string, msg: string) => createHmac("sha256", key).update(msg).digest("base64");

function req(body: string, headers: Record<string, string>): SignedRequest {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { body, header: (name) => lower[name.toLowerCase()] };
}

describe("verifyDelivery — valid signatures", () => {
  it("Meta (Instagram / Facebook): X-Hub-Signature-256", async () => {
    const r = req(IG_COMMENT, { "X-Hub-Signature-256": `sha256=${hex("sha256", SECRET, IG_COMMENT)}` });
    assert.equal(await verifyDelivery("instagram", r, SECRET, NOW_SEC), true);
    assert.equal(await verifyDelivery("facebook", r, SECRET, NOW_SEC), true);
  });

  it("TikTok: t=…,s=… over '<t>.<body>'", async () => {
    const t = NOW_SEC - 30;
    const r = req(TIKTOK_PUBLIC, { "TikTok-Signature": `t=${t},s=${hex("sha256", SECRET, `${t}.${TIKTOK_PUBLIC}`)}` });
    assert.equal(await verifyDelivery("tiktok", r, SECRET, NOW_SEC), true);
  });

  it("X: base64 X-Twitter-Webhooks-Signature", async () => {
    const r = req(X_LIKE, { "X-Twitter-Webhooks-Signature": `sha256=${b64(SECRET, X_LIKE)}` });
    assert.equal(await verifyDelivery("x", r, SECRET, NOW_SEC), true);
  });

  it("LinkedIn: X-LI-Signature, bare or hmacsha256=-prefixed", async () => {
    const sig = hex("sha256", SECRET, LINKEDIN_ACTION);
    assert.equal(await verifyDelivery("linkedin", req(LINKEDIN_ACTION, { "X-LI-Signature": sig }), SECRET, NOW_SEC), true);
    assert.equal(await verifyDelivery("linkedin", req(LINKEDIN_ACTION, { "X-LI-Signature": `hmacsha256=${sig}` }), SECRET, NOW_SEC), true);
  });

  it("YouTube WebSub: X-Hub-Signature sha1", async () => {
    const r = req(YOUTUBE_ATOM, { "X-Hub-Signature": `sha1=${hex("sha1", SECRET, YOUTUBE_ATOM)}` });
    assert.equal(await verifyDelivery("youtube", r, SECRET, NOW_SEC), true);
  });
});

describe("verifyDelivery — invalid signatures", () => {
  it("refuses a tampered body", async () => {
    const tampered = IG_COMMENT.replace("Love this!", "Buy followers");
    const r = req(tampered, { "X-Hub-Signature-256": `sha256=${hex("sha256", SECRET, IG_COMMENT)}` });
    assert.equal(await verifyDelivery("instagram", r, SECRET, NOW_SEC), false);
  });

  it("refuses a signature made with another secret", async () => {
    const r = req(X_LIKE, { "X-Twitter-Webhooks-Signature": `sha256=${b64("not-our-secret", X_LIKE)}` });
    assert.equal(await verifyDelivery("x", r, SECRET, NOW_SEC), false);
  });

  it("refuses a missing or malformed header", async () => {
    assert.equal(await verifyDelivery("youtube", req(YOUTUBE_ATOM, {}), SECRET, NOW_SEC), false);
    const r = req(IG_COMMENT, { "X-Hub-Signature-256": hex("sha256", SECRET, IG_COMMENT) }); // no sha256= prefix
    assert.equal(await verifyDelivery("facebook", r, SECRET, NOW_SEC), false);
  });

  it("refuses a TikTok delivery whose timestamp is more than 5 minutes off (replay)", async () => {
    const t = NOW_SEC - 301;
    const r = req(TIKTOK_PUBLIC, { "TikTok-Signature": `t=${t},s=${hex("sha256", SECRET, `${t}.${TIKTOK_PUBLIC}`)}` });
    assert.equal(await verifyDelivery("tiktok", r, SECRET, NOW_SEC), false);
  });

  it("checkDelivery refuses everything when the network's secret isn't configured", async () => {
    const r = req(IG_COMMENT, { "X-Hub-Signature-256": `sha256=${hex("sha256", "", IG_COMMENT)}` });
    assert.equal(await checkDelivery("instagram", r, { secretFor: () => "", nowSec: () => NOW_SEC }), false);
  });
});

describe("handshakeReply", () => {
  const q = (params: Record<string, string>) => (name: string) => params[name];
  const secrets = { secret: SECRET, verifyToken: "hv-webhook-verify-2026" };

  it("Meta echoes the challenge only for our verify token", async () => {
    assert.deepEqual(
      await handshakeReply("facebook", q({ "hub.mode": "subscribe", "hub.verify_token": "hv-webhook-verify-2026", "hub.challenge": "1158201444" }), secrets),
      { kind: "text", body: "1158201444" },
    );
    assert.equal(await handshakeReply("instagram", q({ "hub.mode": "subscribe", "hub.verify_token": "guess", "hub.challenge": "1" }), secrets), null);
  });

  it("X answers the CRC with the base64 HMAC of the token", async () => {
    assert.deepEqual(await handshakeReply("x", q({ crc_token: "crc-abc123" }), secrets), {
      kind: "json",
      body: { response_token: `sha256=${b64(SECRET, "crc-abc123")}` },
    });
  });

  it("LinkedIn answers challengeCode with its hex HMAC", async () => {
    assert.deepEqual(await handshakeReply("linkedin", q({ challengeCode: "890e4665-4dfe-4ab7-b2f7-0c2fa9d0e0c1" }), secrets), {
      kind: "json",
      body: { challengeCode: "890e4665-4dfe-4ab7-b2f7-0c2fa9d0e0c1", challengeResponse: hex("sha256", SECRET, "890e4665-4dfe-4ab7-b2f7-0c2fa9d0e0c1") },
    });
  });

  it("TikTok has no GET handshake", async () => {
    assert.equal(await handshakeReply("tiktok", q({ challenge: "x" }), secrets), null);
  });
});

describe("parseWebhookEvents", () => {
  it("reduces each network's delivery to the posts it names", () => {
    assert.deepEqual(parseWebhookEvents("instagram", IG_COMMENT).postIds, ["18027939643230671"]);
    assert.deepEqual(parseWebhookEvents("x", X_LIKE).postIds, ["1844417062718726000"]);
    assert.deepEqual(parseWebhookEvents("linkedin", LINKEDIN_ACTION).postIds, ["urn:li:share:7247000000000000000"]);
    assert.deepEqual(parseWebhookEvents("youtube", YOUTUBE_ATOM).postIds, ["Ks-_Mh1QhMc"]);
  });

  it("turns TikTok's publicly-available event into a publish → post id confirmation", () => {
    assert.deepEqual(parseWebhookEvents("tiktok", TIKTOK_PUBLIC), {
      postIds: ["7429184417062718726"],
      confirmations: [{ pendingId: "v_pub_url~v2-1.7429184417062718726", postId: "7429184417062718726" }],
    });
  });

  it("yields nothing for garbage", () => {
    assert.deepEqual(parseWebhookEvents("facebook", "not json"), { postIds: [], confirmations: [] });
  });
});

describe("ingestDelivery", () => {
  it("re-keys the TikTok publication, then refreshes only posts hired.video published", async () => {
    const confirmed: unknown[] = [];
    const synced: string[] = [];
    const result = await ingestDelivery("tiktok", TIKTOK_PUBLIC, undefined, {
      confirm: async (args) => {
        confirmed.push(args);
        return "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
      },
      findPublications: async ({ externalIds }) =>
        externalIds.map((externalId) => ({ id: "p-tt-1", projectId: "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d", posterUserId: "u", destination: "tiktok", externalId })),
      sync: async (pubs) => {
        synced.push(...pubs.map((p) => p.externalId));
        return { posts: pubs.length, stored: pubs.length, groupsFailed: 0, deferred: 0 };
      },
    });
    assert.deepEqual(confirmed, [
      { destination: "tiktok", pendingExternalId: "v_pub_url~v2-1.7429184417062718726", externalId: "7429184417062718726" },
    ]);
    assert.deepEqual(synced, ["7429184417062718726"]);
    assert.deepEqual(result, { confirmed: 1, refreshed: 1 });
  });

  it("an event about someone else's post reads nothing", async () => {
    let synced = false;
    const result = await ingestDelivery("x", X_LIKE, undefined, {
      findPublications: async () => [],
      sync: async () => {
        synced = true;
        return { posts: 0, stored: 0, groupsFailed: 0, deferred: 0 };
      },
    });
    assert.equal(synced, false);
    assert.deepEqual(result, { confirmed: 0, refreshed: 0 });
  });
});
