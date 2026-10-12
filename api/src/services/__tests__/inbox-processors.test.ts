/**
 * Role-aware inbox processors — regression + parity tests (#1985).
 *
 * These are pure (no DB): they lock the zero-regression guarantee for the
 * Job Hunter preset, prove the recruiter rule sets classify, and assert
 * the seeded migration rows still mirror shared/presets.ts so the two
 * can't drift. Real-shape fixtures (seed-derived preset UUIDs, the actual
 * prompt strings) per feedback_tests_with_real_fixtures.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyByRules,
  JOB_INBOX_CATEGORIES,
  isJobCategory,
  isVisibleCategory,
  presetToProfile,
  presetTaxonomy,
  INBOX_PRESETS,
  PRESET_IDS,
  JOB_HUNTER,
  defaultPresetKeyForRole,
  actionTriggerMatches,
  INBOX_ACTION_TRIGGERS,
} from "../../../../shared/email-classification/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(__dirname, "../../../drizzle");

function mkEmail(over: Record<string, unknown> = {}) {
  return {
    fromEmail: "x@y.com",
    fromName: null,
    subject: "",
    snippet: "",
    bodyHtml: null,
    bodyText: "",
    ...over,
  } as any;
}

describe("Job Hunter preset — zero-regression lock (#1979)", () => {
  const jobHunter = presetToProfile(JOB_HUNTER);

  it("visible categories exactly equal the legacy JOB_INBOX_CATEGORIES", () => {
    const visible = jobHunter.taxonomy.filter((c) => c.visible).map((c) => c.key).sort();
    assert.deepEqual(visible, [...JOB_INBOX_CATEGORIES].sort());
  });

  it("isVisibleCategory(jobHunter) matches the legacy isJobCategory for every category", () => {
    const all = [
      "job_opportunity", "application_status", "recruiter_outreach", "interview_invite",
      "offer", "rejection", "newsletter", "spam", "personal", "other", "made_up",
    ];
    for (const cat of all) {
      assert.equal(
        isVisibleCategory(cat, jobHunter),
        isJobCategory(cat as any),
        `visibility drift for "${cat}"`,
      );
    }
  });

  it("uses the job_seeker default rule set + 0.5 threshold", () => {
    assert.equal(jobHunter.defaultRuleSet, "job_seeker");
    assert.equal(jobHunter.minRelevanceScore, 0.5);
    assert.equal(jobHunter.extractSchema, null);
  });

  it("classifyByRules default arg == explicit job_seeker (back-compat)", () => {
    const email = mkEmail({ fromEmail: "no-reply@greenhouse.io", subject: "Hi" });
    const a = classifyByRules(email, []);
    const b = classifyByRules(email, [], "job_seeker");
    assert.deepEqual(a, b);
    assert.equal(a?.category, "application_status");
  });
});

describe("Recruiter rule sets classify recruiter mail (#1980)", () => {
  it("recruiter_sourcing tags a new requisition", () => {
    const r = classifyByRules(
      mkEmail({ subject: "New requisition: Staff Engineer", bodyText: "please fill" }),
      [],
      "recruiter_sourcing",
    );
    assert.equal(r?.category, "new_requisition");
  });

  it("recruiter_bizdev tags a hiring signal", () => {
    const r = classifyByRules(
      mkEmail({ subject: "Acme is hiring 20 engineers", bodyText: "expanding" }),
      [],
      "recruiter_bizdev",
    );
    assert.equal(r?.category, "company_hiring");
  });

  it("job-seeker ATS rules do NOT fire under a recruiter rule set", () => {
    // greenhouse.io → application_status only under job_seeker; a recruiter
    // mailbox must not mis-tag it (the whole point of profile-scoped rules).
    const r = classifyByRules(
      mkEmail({ fromEmail: "no-reply@greenhouse.io", subject: "hi" }),
      [],
      "recruiter_sourcing",
    );
    assert.equal(r, null); // falls through to Stage-2 LLM, not application_status
  });
});

describe("Action trigger matching (#1981)", () => {
  it("always fires regardless of category", () => {
    assert.equal(
      actionTriggerMatches({ triggerType: INBOX_ACTION_TRIGGERS.ALWAYS, triggerValue: null }, { category: "x" }),
      true,
    );
  });
  it("category matches only its own key", () => {
    const a = { triggerType: INBOX_ACTION_TRIGGERS.CATEGORY, triggerValue: "new_requisition" } as const;
    assert.equal(actionTriggerMatches(a, { category: "new_requisition" }), true);
    assert.equal(actionTriggerMatches(a, { category: "candidate_reply" }), false);
  });
  it("rule matches the rule name", () => {
    const a = { triggerType: INBOX_ACTION_TRIGGERS.RULE, triggerValue: "default:offer_offer letter" } as const;
    assert.equal(actionTriggerMatches(a, { category: "offer", ruleName: "default:offer_offer letter" }), true);
    assert.equal(actionTriggerMatches(a, { category: "offer", ruleName: "other" }), false);
  });
});

describe("Onboarding preset selection (#1984)", () => {
  it("recruiter → sourcing, job_seeker/other → job_hunter", () => {
    assert.equal(defaultPresetKeyForRole("recruiter"), "recruiter_sourcing");
    assert.equal(defaultPresetKeyForRole("job_seeker"), "job_hunter");
    assert.equal(defaultPresetKeyForRole("employer"), "job_hunter");
    assert.equal(defaultPresetKeyForRole(null), "job_hunter");
  });
});

describe("Migration ↔ presets.ts parity (#1985)", () => {
  const sql = [
    readFileSync(join(DRIZZLE_DIR, "0206_inbox_profiles.sql"), "utf8"),
    readFileSync(join(DRIZZLE_DIR, "0207_inbox_recruiter_presets.sql"), "utf8"),
  ].join("\n");

  for (const def of INBOX_PRESETS) {
    it(`seed row for "${def.presetKey}" mirrors the code preset`, () => {
      // The seeded migration must carry this preset's fixed UUID, key,
      // name, default rule set, and the first line of its classify prompt.
      assert.ok(sql.includes(def.id), `missing UUID ${def.id}`);
      assert.ok(sql.includes(`'${def.presetKey}'`), `missing presetKey ${def.presetKey}`);
      assert.ok(sql.includes(def.name), `missing name ${def.name}`);
      assert.ok(sql.includes(`'${def.defaultRuleSet}'`), `missing rule set ${def.defaultRuleSet}`);
      const firstPromptLine = def.classifyPrompt.split("\n")[0];
      assert.ok(sql.includes(firstPromptLine), `prompt drift for ${def.presetKey}`);
      // Every visible category key must appear in the seeded taxonomy JSON.
      for (const cat of presetTaxonomy(def).filter((c) => c.visible)) {
        assert.ok(sql.includes(`"${cat.key}"`), `taxonomy missing ${cat.key} for ${def.presetKey}`);
      }
    });
  }

  it("PRESET_IDS keys cover every shipped preset", () => {
    assert.deepEqual(
      INBOX_PRESETS.map((p) => p.presetKey).sort(),
      Object.keys(PRESET_IDS).sort(),
    );
  });
});
