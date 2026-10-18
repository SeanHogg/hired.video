/**
 * Extension preferences — settings shared by the Chrome extension sidepanels
 * (jobseeker + recruiter) and the web /settings?tab=extensions page. Stored as
 * one jsonb blob on user_settings (account section) so the shape can evolve without a new
 * column per toggle.
 */

/** Defaults applied on top of whatever the DB returned, so new toggles
 *  added later just show up with their server-side default without
 *  requiring a backfill. The `ai` surface is read by the AI coach
 *  (`/chat`) — when `autoApplyChanges` is true, the coach skips the
 *  per-mutation Apply button and persists tool-driven edits immediately. */
export const defaultExtensionSettings = () => ({
  jobseeker: {
    autoDetect: true,
    autoScore: false,
    autoTailor: false,
    telemetryOptOut: false,
    downloadFormat: "pdf",
  },
  recruiter: {
    autoDetectJobs: true,
    autoDetectProfiles: true,
    autoDetectCompanies: true,
    autoScore: false,
    telemetryOptOut: false,
  },
  ai: {
    autoApplyChanges: false,
  },
});

export type ExtensionSettings = ReturnType<typeof defaultExtensionSettings>;

function objectOrEmpty(v: unknown): Record<string, unknown> {
  return (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
}

/** Merge stored JSON with defaults so missing keys fall back cleanly. */
export function mergeExtensionSettings(stored: unknown): ExtensionSettings {
  const defaults = defaultExtensionSettings();
  if (!stored || typeof stored !== "object") return defaults;
  const s = stored as Record<string, unknown>;
  return {
    jobseeker: { ...defaults.jobseeker, ...objectOrEmpty(s.jobseeker) } as ExtensionSettings["jobseeker"],
    recruiter: { ...defaults.recruiter, ...objectOrEmpty(s.recruiter) } as ExtensionSettings["recruiter"],
    ai: { ...defaults.ai, ...objectOrEmpty(s.ai) } as ExtensionSettings["ai"],
  };
}

/** Apply a client patch per surface so a partial update (one toggle) never
 *  wipes another surface's settings. */
export function applyExtensionSettingsPatch(current: ExtensionSettings, body: unknown): ExtensionSettings {
  const patch = objectOrEmpty(body);
  return {
    jobseeker: { ...current.jobseeker, ...objectOrEmpty(patch.jobseeker) } as ExtensionSettings["jobseeker"],
    recruiter: { ...current.recruiter, ...objectOrEmpty(patch.recruiter) } as ExtensionSettings["recruiter"],
    ai: { ...current.ai, ...objectOrEmpty(patch.ai) } as ExtensionSettings["ai"],
  };
}
