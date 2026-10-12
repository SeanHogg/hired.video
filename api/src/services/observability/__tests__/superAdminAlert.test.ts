/**
 * SuperAdmin ops alerts: one send per key per window (awaited KV marker,
 * in-isolate fallback without KV), escaped body, a failed send returns false
 * and only holds a short retry marker, failures never thrown to the caller.
 *
 * Run: node --import tsx --test src/services/observability/__tests__/superAdminAlert.test.ts
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  SEND_FAILURE_RETRY_SECONDS,
  alertCacheKey,
  clearAlertMarker,
  raiseSuperAdminAlert,
  superAdminEmail,
  type AlertMarkerStore,
  type AlertSender,
} from "../superAdminAlert.js";

/** A KV-shaped store that records puts (awaited, like the real binding). */
function fakeKv() {
  const data = new Map<string, string>();
  const puts: Array<{ key: string; value: string; ttl: number }> = [];
  const store: AlertMarkerStore = {
    async get(key) {
      return data.get(key) ?? null;
    },
    async put(key, value, { expirationTtl }) {
      puts.push({ key, value, ttl: expirationTtl });
      data.set(key, value);
    },
  };
  return { store, data, puts };
}

function spySender(result: boolean | Error = true) {
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const send: AlertSender = async (to, subject, html) => {
    sent.push({ to, subject, html });
    if (result instanceof Error) throw result;
    return result;
  };
  return { send, sent };
}

let seq = 0;
const uniqueKey = (label: string) => `test:${label}:${Date.now()}:${seq++}`;

describe("raiseSuperAdminAlert", () => {
  it("sends once per window for the same key", async () => {
    const { send, sent } = spySender();
    const alert = { key: uniqueKey("dedupe"), windowSeconds: 3600, subject: "Thing broke", message: "details" };
    assert.equal(await raiseSuperAdminAlert(alert, send), true);
    assert.equal(await raiseSuperAdminAlert(alert, send), false);
    assert.equal(await raiseSuperAdminAlert(alert, send), false);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.to, superAdminEmail());
    assert.equal(sent[0]?.subject, "[hired.video] Thing broke");
  });

  it("concurrent first calls share one send", async () => {
    const { send, sent } = spySender();
    const alert = { key: uniqueKey("burst"), windowSeconds: 3600, subject: "Burst", message: "x" };
    const results = await Promise.all(Array.from({ length: 5 }, () => raiseSuperAdminAlert(alert, send)));
    assert.equal(sent.length, 1);
    assert.equal(results.filter(Boolean).length, 1);
  });

  it("different keys alert independently", async () => {
    const { send, sent } = spySender();
    await raiseSuperAdminAlert({ key: uniqueKey("a"), windowSeconds: 3600, subject: "A", message: "a" }, send);
    await raiseSuperAdminAlert({ key: uniqueKey("b"), windowSeconds: 3600, subject: "B", message: "b" }, send);
    assert.equal(sent.length, 2);
  });

  it("alerts again once the window entry is gone", async () => {
    const { send, sent } = spySender();
    const alert = { key: uniqueKey("expire"), windowSeconds: 3600, subject: "Again", message: "m" };
    await raiseSuperAdminAlert(alert, send);
    clearAlertMarker(alert.key);
    await raiseSuperAdminAlert(alert, send);
    assert.equal(sent.length, 2);
  });

  it("a throwing sender is swallowed, returns false, and holds only a short retry marker", async () => {
    const { send, sent } = spySender(new Error("provider down"));
    const kv = fakeKv();
    const alert = { key: uniqueKey("throw"), windowSeconds: 6 * 3600, subject: "S", message: "m" };
    assert.equal(await raiseSuperAdminAlert(alert, send, kv.store), false);
    assert.equal(await raiseSuperAdminAlert(alert, send, kv.store), false, "no immediate re-send loop");
    assert.equal(sent.length, 1);
    assert.equal(kv.puts.at(-1)?.ttl, SEND_FAILURE_RETRY_SECONDS);
    assert.equal(kv.puts.at(-1)?.value, "send-failed");
    // The short marker expires → the next hit retries.
    kv.data.delete(alertCacheKey(alert.key));
    assert.equal(await raiseSuperAdminAlert(alert, spySender().send, kv.store), true);
  });

  it("a sender resolving false is a failed send too", async () => {
    const { send } = spySender(false);
    const kv = fakeKv();
    const alert = { key: uniqueKey("false"), windowSeconds: 3600, subject: "S", message: "m" };
    assert.equal(await raiseSuperAdminAlert(alert, send, kv.store), false);
    assert.equal(kv.puts.at(-1)?.ttl, SEND_FAILURE_RETRY_SECONDS);
  });

  it("KV: the marker is written (window TTL) BEFORE the send, and a present marker skips", async () => {
    const kv = fakeKv();
    const alert = { key: uniqueKey("kv"), windowSeconds: 7200, subject: "K", message: "m" };
    let markerAtSend: string | undefined;
    const send: AlertSender = async () => {
      markerAtSend = kv.data.get(alertCacheKey(alert.key));
      return true;
    };
    assert.equal(await raiseSuperAdminAlert(alert, send, kv.store), true);
    assert.ok(markerAtSend, "marker awaited before sending");
    assert.deepEqual(kv.puts.map((p) => p.ttl), [7200]);
    // Another isolate (fresh in-flight map is irrelevant — the marker decides).
    const other = spySender();
    assert.equal(await raiseSuperAdminAlert(alert, other.send, kv.store), false);
    assert.equal(other.sent.length, 0);
  });

  it("a KV outage doesn't send unguarded and never throws", async () => {
    const { send, sent } = spySender();
    const broken: AlertMarkerStore = {
      get: async () => {
        throw new Error("kv down");
      },
      put: async () => undefined,
    };
    const alert = { key: uniqueKey("kvdown"), windowSeconds: 3600, subject: "S", message: "m" };
    assert.equal(await raiseSuperAdminAlert(alert, send, broken), false);
    assert.equal(sent.length, 0);
  });

  it("escapes the message into the HTML body", async () => {
    const { send, sent } = spySender();
    await raiseSuperAdminAlert(
      { key: uniqueKey("escape"), windowSeconds: 3600, subject: "<b>x</b>", message: `<script>"&"</script>` },
      send,
    );
    const html = sent[0]?.html ?? "";
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;"));
  });
});
