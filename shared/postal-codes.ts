/**
 * Per-country postal-code patterns and placeholder hints.
 *
 * Driven by BillingAddressSchema in [billing-address.ts](./billing-address.ts)
 * via `.superRefine` — when the chosen `country` has an entry here, the
 * `postalCode` field is validated against the pattern. Countries without an
 * entry fall back to the legacy free-form max-20-chars rule (preserves
 * pre-Phase-1 behavior for unsupported jurisdictions).
 *
 * Extend this map per phase (Phase 1: CA; Phase 2: MX; Phase 3: GB/DE/FR/etc.).
 */

export interface PostalPattern {
  /** ECMAScript RegExp matching valid postal codes for this country. */
  pattern: RegExp;
  /** Example/placeholder shown in the input (also used for error messages). */
  placeholder: string;
  /** Country-localised label for the field — defaults at the consumer when
   *  not supplied. ("ZIP code" in US, "Postal code" in CA/GB, "Postcode" in
   *  AU/NZ, "CP" in MX). Useful when the address form is i18n-aware. */
  label?: string;
}

export const POSTAL_PATTERNS: Record<string, PostalPattern> = {
  // US ZIP — 5 digits with optional +4. Case-insensitive isn't needed but
  // the pattern is anchored so partial matches don't slip through.
  US: { pattern: /^\d{5}(-\d{4})?$/, placeholder: "12345 or 12345-6789", label: "ZIP code" },
  // Canada — A1A 1A1 (Canada Post). Space optional; the first character of
  // each block excludes letters Canada Post never assigns (D, F, I, O, Q, U,
  // plus W and Z at the very start). Postal-code validators differ on
  // strictness; we use the canonical Canada Post set.
  CA: {
    pattern: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i,
    placeholder: "A1A 1A1",
    label: "Postal code",
  },
  // Mexico — Código Postal, 5 digits.
  MX: { pattern: /^\d{5}$/, placeholder: "12345", label: "Código Postal" },
  // UK postcode — variable-length format (M1 1AA, SW1A 1AA, B33 8TH, etc.).
  GB: {
    pattern: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
    placeholder: "SW1A 1AA",
    label: "Postcode",
  },
  DE: { pattern: /^\d{5}$/, placeholder: "10115", label: "Postleitzahl" },
  FR: { pattern: /^\d{5}$/, placeholder: "75001", label: "Code postal" },
};

/** Look up the postal pattern for a country code (ISO 3166-1 alpha-2,
 *  case-insensitive). Undefined for unsupported countries → consumers fall
 *  back to free-form validation. */
export function getPostalPattern(country: string | null | undefined): PostalPattern | undefined {
  if (!country) return undefined;
  return POSTAL_PATTERNS[country.toUpperCase()];
}

/** True when the value is a valid postal code for the country (or when no
 *  pattern is registered, accepting any non-empty value). */
export function isValidPostalCode(country: string | null | undefined, value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const p = getPostalPattern(country);
  if (!p) return true;
  return p.pattern.test(trimmed);
}
