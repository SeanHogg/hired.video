/**
 * Config capability evaluation + snapshot dedupe (request-log evidence, 0506).
 *
 * Run: node --import tsx --test src/services/observability/__tests__/config-snapshot.test.ts
 */
import { beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { evaluateCapabilities, type CapabilitySpec } from "../config-capabilities.js";
import {
  CONFIG_SNAPSHOT_ACTION,
  __resetConfigSnapshotGuard,
  recordConfigSnapshot,
} from "../config-snapshot.js";

const SPECS: CapabilitySpec[] = [
  { capability: "auth.sessions", requires: ["JWT_SECRET"] },
  { capability: "payments.helcim", requires: ["HELCIM_API_TOKEN", "HELCIM_WEBHOOK_TOKEN"] },
  { capability: "maps.geocoding", requires: [["MAPBOX_TOKEN", "MAPBOX_ACCESS_TOKEN"]] },
];

const reader = (vars: Record<string, string>) => (name: string) => vars[name] ?? "";

describe("evaluateCapabilities", () => {
  it("marks a capability ready only when every requirement is set", () => {
    const report = evaluateCapabilities(SPECS, reader({ JWT_SECRET: "x", HELCIM_API_TOKEN: "t" }));
    assert.deepEqual(report["auth.sessions"], { ready: true, missing: [] });
    assert.deepEqual(report["payments.helcim"], { ready: false, missing: ["HELCIM_WEBHOOK_TOKEN"] });
  });

  it("accepts any one name of an any-of requirement and reports the group when none is set", () => {
    assert.equal(evaluateCapabilities(SPECS, reader({ MAPBOX_ACCESS_TOKEN: "m" }))["maps.geocoding"].ready, true);
    assert.deepEqual(evaluateCapabilities(SPECS, reader({}))["maps.geocoding"].missing, [
      "MAPBOX_TOKEN|MAPBOX_ACCESS_TOKEN",
    ]);
  });

  it("treats a whitespace-only value as unset", () => {
    assert.equal(evaluateCapabilities(SPECS, reader({ JWT_SECRET: "   " }))["auth.sessions"].ready, false);
  });
});

describe("recordConfigSnapshot", () => {
  const prevEnv = (globalThis as any).__ENV;
  let kvStore: Map<string, string>;
  let inserts: any[];
  const audit = { insertActivity: async (row: any) => void inserts.push(row) };

  beforeEach(() => {
    __resetConfigSnapshotGuard();
    kvStore = new Map();
    inserts = [];
    (globalThis as any).__ENV = {
      ...prevEnv,
      CF_VERSION_METADATA: { id: "v-1", tag: "t", timestamp: "2026-10-10T00:00:00Z" },
      KV_CACHE: {
        get: async (k: string) => kvStore.get(k) ?? null,
        put: async (k: string, v: string) => void kvStore.set(k, v),
      },
    };
  });

  it("writes one row per (release, report) and skips repeats, across isolates via KV", async () => {
    const report = evaluateCapabilities(SPECS, reader({ JWT_SECRET: "x" }));
    assert.equal(await recordConfigSnapshot(audit, report), true);
    assert.equal(await recordConfigSnapshot(audit, report), false);
    __resetConfigSnapshotGuard(); // a fresh isolate still sees the KV marker
    assert.equal(await recordConfigSnapshot(audit, report), false);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].action, CONFIG_SNAPSHOT_ACTION);
    assert.equal(inserts[0].metadata.release.id, "v-1");
    assert.deepEqual(inserts[0].metadata.notReady, ["payments.helcim", "maps.geocoding"]);
  });

  it("writes again when the configured set changes", async () => {
    await recordConfigSnapshot(audit, evaluateCapabilities(SPECS, reader({})));
    await recordConfigSnapshot(audit, evaluateCapabilities(SPECS, reader({ JWT_SECRET: "x" })));
    assert.equal(inserts.length, 2);
  });

  it("never records a secret value", async () => {
    await recordConfigSnapshot(audit, evaluateCapabilities(SPECS, reader({ JWT_SECRET: "super-secret-value" })));
    assert.equal(JSON.stringify(inserts).includes("super-secret-value"), false);
  });
});
