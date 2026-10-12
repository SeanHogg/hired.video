// Per-persona /pricing copy keys (descriptions, feature arrays, unit labels).
// t() is called at render in the page — never at module scope.
import { USER_ROLES, type UserRole } from "@/lib/auth";

// Per-persona copy is i18n-key driven: each persona carries the dotted keys
// for its descriptions, feature arrays (resolved via returnObjects), unit /
// count labels, and an inbox-sync scope appended at render so the dynamic
// quota + add-on price stay in one place. t() is called at render below —
// never at module scope.
export type InboxScope = "none" | "perSeat" | "perUser";
export type PersonaCopyKeys = {
  labelKey: string;
  freeDescriptionKey: string;
  proDescriptionKey: string;
  freeFeaturesKey: string;
  proFeaturesKey: string;
  inboxScope: InboxScope; // appended to proFeatures when not "none"
  unitLabelKey: string;
  userCountLabelKey: string | null; // null → no count selector label
};
export const PERSONA_COPY: Partial<Record<UserRole, PersonaCopyKeys>> = {
  [USER_ROLES.JOB_SEEKER]: {
    labelKey: "labels.jobSeeker",
    freeDescriptionKey: "messages.pricing.persona.jobSeeker.freeDesc",
    proDescriptionKey: "messages.pricing.persona.jobSeeker.proDesc",
    freeFeaturesKey: "pricing.persona.jobSeeker.freeFeatures",
    proFeaturesKey: "pricing.persona.jobSeeker.proFeatures",
    inboxScope: "none",
    unitLabelKey: "marketing.pricing.persona.jobSeeker.unitLabel",
    userCountLabelKey: null,
  },
  [USER_ROLES.RECRUITER]: {
    labelKey: "labels.recruiterLowercase",
    freeDescriptionKey: "marketing.pricing.persona.recruiter.freeDesc",
    proDescriptionKey: "marketing.pricing.persona.recruiter.proDesc",
    freeFeaturesKey: "pricing.persona.recruiter.freeFeatures",
    proFeaturesKey: "pricing.persona.recruiter.proFeatures",
    inboxScope: "perSeat",
    unitLabelKey: "marketing.pricing.persona.recruiter.unitLabel",
    userCountLabelKey: "marketing.pricing.persona.recruiter.userCountLabel",
  },
  [USER_ROLES.EMPLOYER]: {
    labelKey: "labels.employerLowercase",
    freeDescriptionKey: "marketing.pricing.persona.employer.freeDesc",
    proDescriptionKey: "marketing.pricing.persona.employer.proDesc",
    freeFeaturesKey: "pricing.persona.employer.freeFeatures",
    proFeaturesKey: "pricing.persona.employer.proFeatures",
    inboxScope: "perUser",
    unitLabelKey: "marketing.pricing.persona.employer.unitLabel",
    userCountLabelKey: "marketing.pricing.persona.employer.userCountLabel",
  },
  [USER_ROLES.ADMIN]: {
    labelKey: "marketing.pricing.persona.admin.label",
    freeDescriptionKey: "marketing.pricing.persona.admin.freeDesc",
    proDescriptionKey: "marketing.pricing.persona.admin.proDesc",
    freeFeaturesKey: "marketing.pricing.persona.admin.freeFeatures",
    proFeaturesKey: "marketing.pricing.persona.admin.proFeatures",
    inboxScope: "none",
    unitLabelKey: "marketing.pricing.persona.admin.unitLabel",
    userCountLabelKey: "marketing.pricing.persona.admin.userCountLabel",
  },
};

/** Job-seeker-only product (HIRING_PERSONAS_ENABLED off): the plan cards'
 *  short value lists. Each entry is one i18n key resolved at render; the
 *  tokens line interpolates PRO_AI_MONTHLY_TOKENS (shared/pricing.ts). */
export const JOB_SEEKER_PLAN_COPY = {
  freeDescriptionKey: "pricing.js.freeDesc",
  proDescriptionKey: "pricing.js.proDesc",
  freeFeatureKeys: [
    "pricing.js.free.build",
    "pricing.js.free.aiLayout",
    "pricing.js.free.preview",
    "pricing.js.free.download",
    "pricing.js.free.channels",
    "pricing.js.free.watermark",
  ],
  proFeatureKeys: [
    "pricing.js.pro.everything",
    "pricing.offer.noWatermark",
    "pricing.offer.unlimitedPosting",
    "pricing.offer.agent",
  ],
  proTokensKey: "pricing.js.pro.tokens",
} as const;
