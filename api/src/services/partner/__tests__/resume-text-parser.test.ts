/**
 * #2270 — partner résumé text goes through ONE switch: default job_seeker
 * (first-party billed subject). Env can flip to partner_owner or off. AI
 * parse billed to that account, deterministic parse as the fallback.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PARTNER_RESUME_AI_PARSE,
  buildPartnerTextParser,
  partnerParseBillingSubject,
  resolvePartnerResumeAiParse,
  type PartnerParseContext,
} from "../resumeTextParser.js";

const OWNER = "5e2d1c0b-9a8f-4e7d-8c6b-5a4f3e2d1c0b";
const SEEKER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const CONTEXT: PartnerParseContext = { partnerOwnerUserId: OWNER, jobSeekerUserId: SEEKER };

/** Pasted plain-text résumé, as partner ATSs send it. */
const RAW_TEXT = `Jordan Rivera
jordan.rivera@example.com | (604) 555-0142 | Vancouver, BC

EXPERIENCE
Senior Software Engineer, Northwind Logistics — Jan 2021 – Present
- Led migration of the dispatch service to event-driven architecture
- Cut p95 latency by 38%

EDUCATION
B.Sc. Computer Science, University of British Columbia, 2016

SKILLS
TypeScript, Node.js, PostgreSQL, AWS`;

const JSON_RESUME = JSON.stringify({
  basics: { name: "Jordan Rivera", email: "jordan.rivera@example.com" },
  work: [{ name: "Northwind Logistics", position: "Senior Software Engineer", startDate: "2021-01" }],
});

describe("partner résumé parse switch", () => {
  it("defaults to job_seeker so partner uploads share the first-party AI parse pipeline", () => {
    assert.equal(PARTNER_RESUME_AI_PARSE, "job_seeker");
  });

  it("resolvePartnerResumeAiParse accepts env values and falls back to the default", () => {
    assert.equal(resolvePartnerResumeAiParse(undefined), "job_seeker");
    assert.equal(resolvePartnerResumeAiParse(null), "job_seeker");
    assert.equal(resolvePartnerResumeAiParse(""), "job_seeker");
    assert.equal(resolvePartnerResumeAiParse("nope"), "job_seeker");
    assert.equal(resolvePartnerResumeAiParse("OFF"), "off");
    assert.equal(resolvePartnerResumeAiParse(" partner_owner "), "partner_owner");
    assert.equal(resolvePartnerResumeAiParse("job_seeker"), "job_seeker");
  });

  it("bills the account the switch names", () => {
    assert.equal(partnerParseBillingSubject("off", CONTEXT), null);
    assert.equal(partnerParseBillingSubject("partner_owner", CONTEXT), OWNER);
    assert.equal(partnerParseBillingSubject("job_seeker", CONTEXT), SEEKER);
    assert.equal(partnerParseBillingSubject("partner_owner", { ...CONTEXT, partnerOwnerUserId: null }), null);
  });

  it("off: never calls the AI and structures text deterministically", async () => {
    let aiCalls = 0;
    const parse = buildPartnerTextParser({
      mode: "off",
      context: async () => CONTEXT,
      aiParse: async () => {
        aiCalls += 1;
        return {};
      },
    });
    const content = await parse(RAW_TEXT);
    assert.equal(aiCalls, 0);
    assert.ok(content.basics, "regex parse yields basics");
  });

  it("a JSON Resume wins over any parse, AI on or off", async () => {
    let aiCalls = 0;
    const parse = buildPartnerTextParser({
      mode: "job_seeker",
      context: async () => CONTEXT,
      aiParse: async () => {
        aiCalls += 1;
        return {};
      },
    });
    const content = await parse(JSON_RESUME);
    assert.equal(aiCalls, 0);
    assert.equal((content.basics as { name?: string }).name, "Jordan Rivera");
  });

  it("on: runs the AI parse billed to the named account", async () => {
    const billed: string[] = [];
    const parse = buildPartnerTextParser({
      mode: "partner_owner",
      context: async () => CONTEXT,
      aiParse: async (_text, billedUserId) => {
        billed.push(billedUserId);
        return { basics: { name: "Jordan Rivera" }, work: [{ name: "Northwind Logistics" }] };
      },
    });
    const content = await parse(RAW_TEXT);
    assert.deepEqual(billed, [OWNER]);
    assert.deepEqual(content.work, [{ name: "Northwind Logistics" }]);
  });

  it("on: falls back to the deterministic parse when the AI fails or nobody can be billed", async () => {
    const failing = buildPartnerTextParser({
      mode: "job_seeker",
      context: async () => CONTEXT,
      aiParse: async () => {
        throw new Error("TokenBudgetExceededError");
      },
    });
    assert.ok((await failing(RAW_TEXT)).basics);

    let aiCalls = 0;
    const adminPartner = buildPartnerTextParser({
      mode: "partner_owner",
      context: async () => ({ ...CONTEXT, partnerOwnerUserId: null }),
      aiParse: async () => {
        aiCalls += 1;
        return {};
      },
    });
    assert.ok((await adminPartner(RAW_TEXT)).basics);
    assert.equal(aiCalls, 0);
  });
});
