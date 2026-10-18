import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRetentionDeleteSql,
  RETENTION_POLICIES,
  type RetentionPolicy,
} from "../retention-sweep.js";
import {
  IMPERSONATION_SESSION_RETENTION_SCOPE,
  RECRUITER_AGENT_RUN_RETENTION_SCOPE,
} from "../retention-policies.js";

function policyFor(table: string): RetentionPolicy {
  const policy = RETENTION_POLICIES.find((p) => p.table === table);
  assert.ok(policy, `${table} policy missing`);
  return policy;
}

/** Expected shape of every policy added in the 2026-10-17 pass (mig 0652). */
const EXPECTED: ReadonlyArray<{ table: string; column: string; days: number; scope?: string }> = [
  { table: "studio_video_heatmap", column: "created_at", days: 180 },
  { table: "enrichment_provider_calls", column: "created_at", days: 90 },
  { table: "recruiter_agent_runs", column: "created_at", days: 90, scope: RECRUITER_AGENT_RUN_RETENTION_SCOPE },
  { table: "inbox_action_runs", column: "created_at", days: 90 },
  { table: "email_sync_runs", column: "started_at", days: 30 },
  { table: "paid_media_sync_runs", column: "created_at", days: 30 },
  { table: "job_board_sync_log", column: "started_at", days: 30 },
  { table: "account_locks", column: "unlocked_at", days: 30, scope: "active = false" },
  { table: "email_change_requests", column: "expires_at", days: 30 },
  { table: "impersonation_sessions", column: "ended_at", days: 365, scope: IMPERSONATION_SESSION_RETENTION_SCOPE },
  { table: "queue_job_to_process", column: "updated_at", days: 30, scope: "status IN ('completed', 'failed')" },
  { table: "social_publish_jobs", column: "updated_at", days: 30, scope: "status IN ('failed', 'cancelled', 'expired')" },
];

describe("write-heavy log retention policies (mig 0652)", () => {
  for (const want of EXPECTED) {
    it(`${want.table}: ${want.column} older than ${want.days}d${want.scope ? " within its scope" : ""}`, () => {
      const policy = policyFor(want.table);
      assert.deepEqual([...policy.ageColumns], [want.column]);
      assert.equal(policy.retentionDays, want.days);
      assert.equal(policy.scope, want.scope);
      assert.ok(policy.batchSize > 0 && policy.batchSize <= 5000);

      const q = buildRetentionDeleteSql(policy);
      const age = `${want.column} < NOW() - INTERVAL '${want.days} days'`;
      if (want.scope) {
        assert.ok(q.includes(`(${age}) AND (${want.scope})`), q);
      } else {
        assert.ok(q.includes(`WHERE ${age}\n`), q);
        assert.doesNotMatch(q, /\bAND\b/);
      }
      // Single age column → oldest-first range scan on its index.
      assert.ok(q.includes(`ORDER BY ${want.column}`), q);
    });
  }

  it("declares each table at most once", () => {
    const tables = RETENTION_POLICIES.map((p) => p.table);
    assert.equal(new Set(tables).size, tables.length);
  });
});

describe("conditional predicates never touch live rows", () => {
  it("account_locks only ever deletes released (inactive) locks", () => {
    const q = buildRetentionDeleteSql(policyFor("account_locks"));
    assert.match(q, /\(unlocked_at < NOW\(\) - INTERVAL '30 days'\) AND \(active = false\)/);
  });

  it("email_change_requests ages out by expiry, so an unexpired pending request can't match", () => {
    const policy = policyFor("email_change_requests");
    assert.deepEqual([...policy.ageColumns], ["expires_at"]);
    assert.equal(policy.scope, undefined);
  });

  it("impersonation_sessions keys on ended_at (NULL for active sessions) and skips audit-referenced rows", () => {
    const q = buildRetentionDeleteSql(policyFor("impersonation_sessions"));
    assert.match(q, /ended_at < NOW\(\) - INTERVAL '365 days'/);
    assert.match(q, /NOT EXISTS \(SELECT 1 FROM admin_audit_log a WHERE a\.impersonation_session_id = impersonation_sessions\.id\)/);
    assert.doesNotMatch(q, /expires_at|started_at/);
  });

  it("queue_job_to_process only sweeps terminal statuses", () => {
    const q = buildRetentionDeleteSql(policyFor("queue_job_to_process"));
    assert.match(q, /AND \(status IN \('completed', 'failed'\)\)/);
    assert.doesNotMatch(q, /'pending'|'processing'/);
  });

  it("social_publish_jobs sweeps failed/cancelled/expired only — never done, draft or live jobs", () => {
    const q = buildRetentionDeleteSql(policyFor("social_publish_jobs"));
    assert.match(q, /AND \(status IN \('failed', 'cancelled', 'expired'\)\)/);
    assert.doesNotMatch(q, /'done'|'draft'|'scheduled'|'running'/);
  });

  it("recruiter_agent_runs keeps pending follow-ups and the latest completed run per job", () => {
    const scope = RECRUITER_AGENT_RUN_RETENTION_SCOPE;
    assert.match(scope, /^status IN \('completed', 'failed'\)/);
    assert.match(scope, /NOT EXISTS \(SELECT 1 FROM recruiter_agent_followups f WHERE f\.run_id = recruiter_agent_runs\.id AND f\.status = 'pending'\)/);
    assert.match(scope, /newer\.job_id = recruiter_agent_runs\.job_id/);
    assert.match(scope, /newer\.completed_at > recruiter_agent_runs\.completed_at/);
    // Balanced parentheses — the scope is wrapped in (…) by the builder.
    const opens = (scope.match(/\(/g) ?? []).length;
    const closes = (scope.match(/\)/g) ?? []).length;
    assert.equal(opens, closes);
  });

  it("leaves out tables whose rows back lifetime counts or read state", () => {
    const tables = new Set(RETENTION_POLICIES.map((p) => p.table));
    assert.equal(tables.has("affiliate_link_clicks"), false);
    assert.equal(tables.has("message_read_receipts"), false);
  });
});
