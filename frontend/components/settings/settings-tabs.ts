// Pure helpers + constants for the /settings page (pages/Settings.tsx).

export const DEFAULT_SETTINGS_TAB = "account-billing";

// Legacy /settings tab remappings — bookmarks + outbound emails still resolve
// after the Account consolidation:
//   • ?tab=payouts / ?tab=leave-creator → creator-profile (earlier merge)
//   • ?tab=team-billing / ?tab=account / ?tab=billing → account-billing
//     (this pass: standalone "Account" + "Team & Billing" sidebar items
//      collapsed into a single "Account & Billing" surface with sub-tabs
//      for billing, usage statement, and account hygiene)
export function remapLegacyTab(tab: string): string {
  if (tab === "payouts" || tab === "leave-creator") return "creator-profile";
  if (tab === "team-billing" || tab === "account" || tab === "billing") return "account-billing";
  // `/services/settings` (the legacy agency sharing settings page) now
  // redirects here with ?tab=recruiter-sharing; older bookmarks may still
  // pass the redirect-side keys "services-settings" or "sharing".
  if (tab === "services-settings" || tab === "sharing") return "recruiter-sharing";
  return tab;
}

/** Resolve the tab to activate on the very first render from a query string. */
export function initialSettingsTab(search: string): string {
  const params = new URLSearchParams(search);
  // ?tab= wins so a deep-link / OAuth callback (?tab=email&connected=…)
  // activates the right tab on the very first render — without this,
  // the useEffect-based sync leaves a flash of the default tab
  // (and prerendered HTML kept the default visible until hydration).
  const explicit = params.get("tab");
  if (explicit) return remapLegacyTab(explicit);
  // If billing_setup=1 is present (e.g. from /settings/billing?billing_setup=1),
  // auto-select the consolidated Account & Billing tab so users land on
  // payment setup directly.
  if (params.get("billing_setup") === "1") return "account-billing";
  return DEFAULT_SETTINGS_TAB;
}

/** "a, b ,, c" → ["a", "b", "c"] — shared by the comma-list job-preference inputs. */
export function splitCommaList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** IANA timezone names — what Intl.DateTimeFormat and lib/hooks/use-user-timezone.ts
 *  expect. Do not use bare UTC±N labels; they aren't valid timezone IDs. */
export const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: "UTC", labelKey: "settings.appearance.timezoneOption.utc" },
  { value: "America/Los_Angeles", labelKey: "settings.appearance.timezoneOption.losAngeles" },
  { value: "America/Denver", labelKey: "settings.appearance.timezoneOption.denver" },
  { value: "America/Chicago", labelKey: "settings.appearance.timezoneOption.chicago" },
  { value: "America/New_York", labelKey: "settings.appearance.timezoneOption.newYork" },
  { value: "America/Sao_Paulo", labelKey: "settings.appearance.timezoneOption.saoPaulo" },
  { value: "Europe/London", labelKey: "settings.appearance.timezoneOption.london" },
  { value: "Europe/Paris", labelKey: "settings.appearance.timezoneOption.paris" },
  { value: "Europe/Athens", labelKey: "settings.appearance.timezoneOption.athens" },
  { value: "Africa/Johannesburg", labelKey: "settings.appearance.timezoneOption.johannesburg" },
  { value: "Asia/Dubai", labelKey: "settings.appearance.timezoneOption.dubai" },
  { value: "Asia/Kolkata", labelKey: "settings.appearance.timezoneOption.kolkata" },
  { value: "Asia/Singapore", labelKey: "settings.appearance.timezoneOption.singapore" },
  { value: "Asia/Tokyo", labelKey: "settings.appearance.timezoneOption.tokyo" },
  { value: "Australia/Sydney", labelKey: "settings.appearance.timezoneOption.sydney" },
  { value: "Pacific/Auckland", labelKey: "settings.appearance.timezoneOption.auckland" },
];

export const OAUTH_LINK_PROVIDERS = ["google", "linkedin", "github", "microsoft"] as const;
export type OAuthLinkProvider = (typeof OAUTH_LINK_PROVIDERS)[number];

export const OAUTH_PROVIDER_LABELS: Record<OAuthLinkProvider, string> = {
  google: "Google",
  linkedin: "LinkedIn",
  github: "GitHub",
  microsoft: "Microsoft",
};

export const SALARY_CURRENCIES = ["USD", "EUR", "GBP"] as const;
