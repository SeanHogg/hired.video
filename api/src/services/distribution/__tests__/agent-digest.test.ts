/**
 * Weekly digest sender: bell always, email pref-gated, push skipped in quiet hours.
 * Run: node --import tsx --test src/services/distribution/__tests__/agent-digest.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sendAgentDigest,
  type AgentDigestDeps,
  type AgentDigestDraft,
} from "../agent-digest.js";

const userId = "user-1";
const hubUrl = "https://hired.video/studio/distribution?tab=agent";
const pauseUrl = "https://hired.video/api/distribution/posting-agent/pause-link?token=test";
const afternoonUtc = new Date("2026-04-07T16:00:00Z");
const quietToronto = new Date("2026-04-08T03:00:00Z"); // 23:00 EDT

const sampleDrafts: AgentDigestDraft[] = [
  {
    id: "draft-1",
    projectTitle: "My Reel",
    destination: "linkedin",
    scheduledAt: new Date("2026-04-08T16:00:00Z"),
  },
  {
    id: "draft-2",
    projectTitle: null,
    destination: "youtube",
    scheduledAt: null,
  },
];

type Prefs = { emailWeeklyDigest: boolean; pushJobMatches: boolean; [k: string]: boolean };

function prefs(over: Partial<Prefs> = {}): Prefs {
  return { emailWeeklyDigest: true, pushJobMatches: true, ...over };
}

function recordingDeps(over: Partial<AgentDigestDeps> = {}): {
  deps: AgentDigestDeps;
  emitBell: Parameters<AgentDigestDeps["emitBell"]>[0][];
  loadPrefs: string[];
  sendEmail: { to: string; subject: string; html: string }[];
  loadUserEmail: string[];
  buildPauseUrl: string[];
} {
  const emitBell: Parameters<AgentDigestDeps["emitBell"]>[0][] = [];
  const loadPrefs: string[] = [];
  const sendEmail: { to: string; subject: string; html: string }[] = [];
  const loadUserEmail: string[] = [];
  const buildPauseUrl: string[] = [];
  const deps: AgentDigestDeps = {
    now: afternoonUtc,
    emitBell: async (input) => {
      emitBell.push(input);
    },
    loadPrefs: async (id) => {
      loadPrefs.push(id);
      return prefs();
    },
    sendEmail: async (input) => {
      sendEmail.push(input);
    },
    loadUserEmail: async (id) => {
      loadUserEmail.push(id);
      return "user@example.com";
    },
    buildPauseUrl: (id) => {
      buildPauseUrl.push(id);
      return pauseUrl;
    },
    ...over,
  };
  return { deps, emitBell, loadPrefs, sendEmail, loadUserEmail, buildPauseUrl };
}

function args(over: Partial<Parameters<typeof sendAgentDigest>[0]> = {}) {
  return {
    userId,
    emailDigest: true,
    quietStartMinute: 21 * 60,
    quietEndMinute: 8 * 60,
    timezone: "UTC",
    drafts: sampleDrafts,
    hubUrl,
    ...over,
  };
}

describe("sendAgentDigest", () => {
  it("no drafts → no calls", async () => {
    const rec = recordingDeps();
    const result = await sendAgentDigest(args({ drafts: [] }), rec.deps);
    assert.deepEqual(result, { bell: false, email: false, push: false });
    assert.equal(rec.emitBell.length, 0);
    assert.equal(rec.loadPrefs.length, 0);
    assert.equal(rec.sendEmail.length, 0);
    assert.equal(rec.loadUserEmail.length, 0);
    assert.equal(rec.buildPauseUrl.length, 0);
  });

  it("email_digest false → bell yes, email no", async () => {
    const rec = recordingDeps();
    const result = await sendAgentDigest(args({ emailDigest: false }), rec.deps);
    assert.equal(result.bell, true);
    assert.equal(result.email, false);
    assert.equal(rec.emitBell.length, 1);
    assert.equal(rec.emitBell[0].type, "weekly_digest");
    assert.equal(rec.emitBell[0].url, "/studio/distribution?tab=agent");
    assert.equal(rec.emitBell[0].email, false);
    assert.match(rec.emitBell[0].title, /2 drafts waiting/);
    assert.equal(rec.sendEmail.length, 0);
    assert.equal(rec.loadUserEmail.length, 0);
    assert.equal(rec.buildPauseUrl.length, 0);
  });

  it("emailWeeklyDigest false → email no, bell yes", async () => {
    const rec = recordingDeps({
      loadPrefs: async () => prefs({ emailWeeklyDigest: false }),
    });
    const result = await sendAgentDigest(args({ emailDigest: true }), rec.deps);
    assert.equal(result.bell, true);
    assert.equal(result.email, false);
    assert.equal(rec.emitBell.length, 1);
    assert.equal(rec.emitBell[0].email, false);
    assert.equal(rec.sendEmail.length, 0);
  });

  it("push channel off → push false, email and bell still go", async () => {
    const rec = recordingDeps({
      loadPrefs: async () => prefs({ pushJobMatches: false }),
    });
    const result = await sendAgentDigest(args(), rec.deps);
    assert.equal(result.bell, true);
    assert.equal(result.email, true);
    assert.equal(result.push, false);
    assert.equal(rec.emitBell[0].push, false);
    assert.equal(rec.sendEmail.length, 1);
  });

  it("loadPrefs throw → bell still fires (never gated)", async () => {
    const rec = recordingDeps({
      loadPrefs: async () => {
        throw new Error("prefs down");
      },
    });
    const result = await sendAgentDigest(args(), rec.deps);
    assert.equal(result.bell, true);
    assert.equal(rec.emitBell.length, 1);
    assert.equal(rec.emitBell[0].url, "/studio/distribution?tab=agent");
    assert.equal(result.email, true);
  });

  it("quiet hours → push false on emitBell", async () => {
    const rec = recordingDeps({ now: quietToronto });
    const result = await sendAgentDigest(
      args({ timezone: "America/Toronto" }),
      rec.deps,
    );
    assert.equal(result.bell, true);
    assert.equal(result.push, false);
    assert.equal(result.email, true);
    assert.equal(rec.emitBell.length, 1);
    assert.equal(rec.emitBell[0].push, false);
    assert.equal(rec.emitBell[0].email, false);
    assert.equal(rec.sendEmail.length, 1);
  });

  it("HTML contains pause URL and hubUrl", async () => {
    const rec = recordingDeps();
    const result = await sendAgentDigest(args(), rec.deps);
    assert.equal(result.bell, true);
    assert.equal(result.email, true);
    assert.equal(result.push, true);
    assert.equal(rec.sendEmail.length, 1);
    const html = rec.sendEmail[0].html;
    assert.ok(html.includes(pauseUrl), "html includes pause URL");
    assert.ok(html.includes(hubUrl), "html includes hubUrl");
    assert.ok(html.includes("Approve"));
    assert.ok(html.includes("Skip"));
    assert.ok(html.includes("My Reel"));
    assert.ok(html.includes("linkedin"));
    assert.equal(rec.buildPauseUrl[0], userId);
    assert.equal(rec.emitBell[0].push, true);
    assert.equal(rec.emitBell[0].email, false);
    assert.equal(rec.emitBell[0].url, "/studio/distribution?tab=agent");
  });
});
