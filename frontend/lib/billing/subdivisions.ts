/**
 * ISO 3166-2 subdivision codes for the countries the Billing form supports.
 *
 * Storing the *code* (e.g. "CA", "ON") in `BillingAddress.state` is what the
 * Helcim customer API expects in its `province` field — passing a free-form
 * name like "California" returns the same `must be a valid Constant` 400 we
 * just fixed for `country`.
 *
 * Extend in lockstep with BillingAddressForm (`components/billing/BillingAddressForm.tsx`)'s
 * COUNTRY_OPTIONS — every country with a dropdown there should have an entry
 * here if Helcim requires a code for it.
 */

export interface Subdivision {
  code: string;
  name: string;
}

/** ISO 3166-2:US — 50 states + DC + the 5 inhabited territories. */
export const US_STATES: readonly Subdivision[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
  { code: "AS", name: "American Samoa" },
  { code: "GU", name: "Guam" },
  { code: "MP", name: "Northern Mariana Islands" },
  { code: "PR", name: "Puerto Rico" },
  { code: "VI", name: "U.S. Virgin Islands" },
];

/** ISO 3166-2:CA — 10 provinces + 3 territories. */
export const CA_PROVINCES: readonly Subdivision[] = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "YT", name: "Yukon" },
];

const SUBDIVISIONS_BY_COUNTRY: Record<string, readonly Subdivision[]> = {
  US: US_STATES,
  CA: CA_PROVINCES,
};

/** Returns the subdivision list for a country, or undefined for free-form. */
export function getSubdivisions(country: string): readonly Subdivision[] | undefined {
  return SUBDIVISIONS_BY_COUNTRY[country.toUpperCase()];
}

/**
 * Map a free-form `state` value to its subdivision code if possible. Handles
 * legacy stored values like "California" → "CA" and idempotent "CA" → "CA".
 * Returns the original input when no match is found so the form can still
 * render the value (the Select will fall back to a free-form input).
 */
export function normalizeSubdivision(country: string, value: string): string {
  const list = getSubdivisions(country);
  if (!list) return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  const byCode = list.find((s) => s.code.toLowerCase() === trimmed.toLowerCase());
  if (byCode) return byCode.code;
  const byName = list.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
  if (byName) return byName.code;
  return trimmed;
}
