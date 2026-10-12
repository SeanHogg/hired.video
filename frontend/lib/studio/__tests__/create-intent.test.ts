import { describe, it, expect } from "vitest";
import {
  CREATE_INTENTS,
  DEFAULT_CREATE_INTENT,
  availableCreateIntents,
  createIntentHref,
  intentForAudienceSlug,
  intentForRole,
  isCreateIntent,
  orderCreateIntents,
  resolveCreateIntent,
} from "@/lib/studio/create-intent";
import { ALL_AUDIENCES, AUDIENCES } from "@/lib/studio/templates/audiences";
import { LIFE_STAGE_AUDIENCE_REGISTRY } from "@shared/audiences-registry";
import { audienceSlug } from "@shared/audiences";
import { NEW_KIT_PATH } from "@/lib/build-entry";

// Shapes mirror production: the auth `User` carries `role` as a USER_ROLES
// value; landing sources are the raw /for/:audience URL slug (profession ids
// are snake_case, life-stage slugs kebab-case); preferences come from
// localStorage and can hold anything.
const jobSeeker = { role: "job_seeker" };
const creator = { role: "creator" };
const recruiter = { role: "recruiter" };
const employer = { role: "employer" };
const admin = { role: "super_admin" };

describe("resolveCreateIntent — happy path", () => {
  it("opens a signed-out visitor with no signals on the core loop (résumé)", () => {
    expect(resolveCreateIntent(null, null, null)).toBe("resume");
  });

  it("follows the role when nothing fresher is known", () => {
    expect(resolveCreateIntent(jobSeeker, {}, {})).toBe("resume");
    expect(resolveCreateIntent(creator, {}, {})).toBe("video");
  });

  it("prefers the viewer's own last pick over the role", () => {
    expect(resolveCreateIntent(jobSeeker, { lastIntent: "video" }, null)).toBe("video");
  });

  it("prefers the landing page they just came through over the last pick and role", () => {
    expect(resolveCreateIntent(jobSeeker, { lastIntent: "resume" }, { audience: "actor" })).toBe("video");
    expect(resolveCreateIntent(creator, { lastIntent: "video" }, { audience: "recent-graduates" })).toBe("resume");
    expect(resolveCreateIntent(creator, null, { audience: "data_analyst" })).toBe("resume");
  });

  it("opens hiring roles on their own creation while hiring personas are on", () => {
    expect(resolveCreateIntent(recruiter, null, null, { hiringEnabled: true })).toBe("job");
    expect(resolveCreateIntent(employer, null, null, { hiringEnabled: true })).toBe("company");
    expect(resolveCreateIntent(null, null, { audience: "recruiter" }, { hiringEnabled: true })).toBe("job");
  });
});

describe("resolveCreateIntent — boundaries", () => {
  it("never returns a hiring intent while the hiring personas are off", () => {
    expect(resolveCreateIntent(recruiter, null, null, { hiringEnabled: false })).toBe("resume");
    expect(resolveCreateIntent(employer, { lastIntent: "job" }, null, { hiringEnabled: false })).toBe("resume");
    expect(resolveCreateIntent(creator, { lastIntent: "company" }, null, { hiringEnabled: false })).toBe("video");
  });

  it("skips a landing source that maps to an unavailable intent and falls through", () => {
    expect(resolveCreateIntent(creator, null, { audience: "employer" }, { hiringEnabled: false })).toBe("video");
  });

  it("accepts either slug spelling for an audience", () => {
    expect(intentForAudienceSlug("voice_actor")).toBe("video");
    expect(intentForAudienceSlug("voice-actor")).toBe("video");
    expect(intentForAudienceSlug("  Recent-Graduates ")).toBe("resume");
  });

  it("every live audience page resolves to an intent the studio offers", () => {
    const offered = new Set(availableCreateIntents());
    for (const a of AUDIENCES) {
      expect(offered.has(resolveCreateIntent(null, null, { audience: a.id })), a.id).toBe(true);
    }
    for (const m of LIFE_STAGE_AUDIENCE_REGISTRY) {
      expect(intentForAudienceSlug(audienceSlug(m.key)), m.key).not.toBeNull();
    }
  });

  it("orders the chooser with the resolved intent first and nothing repeated", () => {
    expect(orderCreateIntents("video", false)).toEqual(["video", "resume"]);
    expect(orderCreateIntents("company", true)).toEqual(["company", "resume", "video", "job"]);
  });
});

describe("resolveCreateIntent — bad input", () => {
  it("ignores a corrupted stored preference", () => {
    expect(resolveCreateIntent(creator, { lastIntent: "podcast" }, null)).toBe("video");
    expect(resolveCreateIntent(null, { lastIntent: "" }, null)).toBe(DEFAULT_CREATE_INTENT);
  });

  it("ignores an unknown or empty landing slug", () => {
    expect(resolveCreateIntent(creator, null, { audience: "not-an-audience" })).toBe("video");
    expect(resolveCreateIntent(null, null, { audience: "" })).toBe("resume");
    expect(intentForAudienceSlug(undefined)).toBeNull();
  });

  it("treats staff / unknown roles as no signal", () => {
    expect(intentForRole(admin.role)).toBeNull();
    expect(intentForRole(undefined)).toBeNull();
    expect(resolveCreateIntent(admin, null, null)).toBe("resume");
  });
});

describe("intent registry", () => {
  it("every audience in the registry declares a known create intent", () => {
    for (const a of ALL_AUDIENCES) expect(isCreateIntent(a.createIntent), a.id).toBe(true);
  });

  it("each intent has an upload-step address", () => {
    expect(createIntentHref("resume")).toBe(NEW_KIT_PATH);
    expect(createIntentHref("video")).toBe("/studio?contentTemplate=basic");
    expect(createIntentHref("video", { videoTemplate: "self_tape" })).toBe("/studio?contentTemplate=self_tape");
    expect(createIntentHref("job")).toBe("/studio?contentTemplate=job_doc");
    expect(createIntentHref("company")).toBe("/studio?contentTemplate=company_doc");
    expect(new Set(CREATE_INTENTS.map((i) => createIntentHref(i))).size).toBe(CREATE_INTENTS.length);
  });
});
