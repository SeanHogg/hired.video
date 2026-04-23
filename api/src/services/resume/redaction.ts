// redaction.ts — Applies a RedactionProfile to a JSON Resume-shaped
// candidate resume, stripping PII before external sharing.
//
// The profile is a persisted row on the `redaction_profiles` table. This
// service is the single place where field-level hiding happens — share
// endpoints must pass content through `applyRedaction` before returning
// it to an unauthenticated reviewer. Failing-open here is how agencies
// leak candidate names; the code is intentionally additive (each toggle
// removes fields) with no silent passthrough.
//
// Content shape follows JSON Resume (basics / work / education / etc.).

export interface RedactionRules {
  hideName: boolean;
  hideEmail: boolean;
  hidePhone: boolean;
  hideAddress: boolean;
  hideLinkedin: boolean;
  hideOtherUrls: boolean;
  hideAvatar: boolean;
  replacementName: string;
  hideCompanyNames: boolean;
  hideSchoolNames: boolean;
  extraStripPaths: string[];
}

export const DEFAULT_REDACTION_RULES: RedactionRules = {
  hideName: true,
  hideEmail: true,
  hidePhone: true,
  hideAddress: true,
  hideLinkedin: true,
  hideOtherUrls: false,
  hideAvatar: true,
  replacementName: "Candidate",
  hideCompanyNames: false,
  hideSchoolNames: false,
  extraStripPaths: [],
};

// Identify LinkedIn URLs to hide selectively when hideLinkedin is on but
// hideOtherUrls is off.
function isLinkedIn(url: string): boolean {
  return /linkedin\.com/i.test(url);
}

/**
 * Delete a value at a dotted path inside `obj`. Supports array indexing
 * via numeric segments (e.g. "work.0.company"). No-ops silently when the
 * path is missing — redaction should never throw.
 */
function deletePath(obj: any, path: string): void {
  const parts = path.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cursor == null || typeof cursor !== "object") return;
    cursor = cursor[parts[i]];
  }
  if (cursor != null && typeof cursor === "object") {
    delete cursor[parts[parts.length - 1]];
  }
}

/**
 * Returns a deep-redacted copy of `content` with PII removed per `rules`.
 * The input is not mutated — shared share endpoints can call this freely.
 */
export function applyRedaction<T>(content: T, rules: RedactionRules): T {
  if (!content || typeof content !== "object") return content;
  // Structured clone via JSON round-trip — resumes are already
  // JSON-serialisable so this is safe and isolates the original.
  const clone: any = JSON.parse(JSON.stringify(content));

  const basics = clone?.basics;
  if (basics && typeof basics === "object") {
    if (rules.hideName) {
      basics.name = rules.replacementName;
    }
    if (rules.hideEmail) delete basics.email;
    if (rules.hidePhone) delete basics.phone;
    if (rules.hideAvatar) {
      delete basics.image;
      delete basics.avatar;
      delete basics.picture;
    }
    if (rules.hideAddress && basics.location && typeof basics.location === "object") {
      delete basics.location.address;
      delete basics.location.postalCode;
      delete basics.location.city;
      delete basics.location.countryCode;
      delete basics.location.region;
    }
    // Profiles array: each profile has network + url.
    if (Array.isArray(basics.profiles)) {
      basics.profiles = basics.profiles.filter((p: any) => {
        const url = typeof p?.url === "string" ? p.url : "";
        const network = typeof p?.network === "string" ? p.network.toLowerCase() : "";
        if (rules.hideLinkedin && (network === "linkedin" || isLinkedIn(url))) return false;
        if (rules.hideOtherUrls) return false;
        return true;
      });
    }
    if (rules.hideOtherUrls) delete basics.url;
    else if (rules.hideLinkedin && typeof basics.url === "string" && isLinkedIn(basics.url)) {
      delete basics.url;
    }
  }

  if (rules.hideCompanyNames && Array.isArray(clone.work)) {
    clone.work = clone.work.map((w: any) => ({
      ...w,
      name: "Company",
      company: w?.company ? "Company" : w?.company,
      url: undefined,
    }));
  }

  if (rules.hideSchoolNames && Array.isArray(clone.education)) {
    clone.education = clone.education.map((e: any) => ({
      ...e,
      institution: "Educational Institution",
      url: undefined,
    }));
  }

  for (const path of rules.extraStripPaths ?? []) {
    if (typeof path === "string" && path.length > 0) deletePath(clone, path);
  }

  return clone as T;
}
