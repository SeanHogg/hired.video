/**
 * useAddressLabels — region-aware copy for address-form fields.
 *
 * Same field, different country = different label. "State" in the US is
 * "Province" in Canada and "Estado" in Mexico. "ZIP code" is "Postal code"
 * in Canada/UK, "Postcode" in Australia/NZ, "Código Postal" in Mexico.
 *
 * Per the DRY rule, every billing-address form reads from this hook —
 * never inline a `country === "CA" ? "Province" : "State"` check at the
 * call site.
 *
 * The hook layers two sources:
 *   1. Country-specific overrides baked into shared/postal-codes.ts for
 *      the postal label (so it matches the placeholder + validator).
 *   2. Translation keys via useTranslation() for everything else, so the
 *      same form rendered in fr-CA gets "Province" from the catalogue
 *      automatically.
 */

import { useTranslation } from "react-i18next";
import { getPostalPattern } from "@shared/postal-codes";

export interface AddressLabels {
  /** Label for the state/province/region field. */
  subdivision: string;
  /** Placeholder hint for the same field. */
  subdivisionPlaceholder: string;
  /** Label for the postal-code field, varying by country (ZIP / Postal / etc.). */
  postalCode: string;
  /** Placeholder hint for the postal-code field — matches the validator. */
  postalCodePlaceholder: string;
}

/** Country-keyed copy. Falls back to generic when the country isn't here. */
const COUNTRY_SUBDIVISION_KEY: Record<string, { label: string; placeholder: string }> = {
  US: { label: "address.subdivision.state", placeholder: "address.subdivisionPlaceholder.state" },
  CA: { label: "address.subdivision.province", placeholder: "address.subdivisionPlaceholder.province" },
  MX: { label: "address.subdivision.estado", placeholder: "address.subdivisionPlaceholder.estado" },
  GB: { label: "address.subdivision.county", placeholder: "address.subdivisionPlaceholder.county" },
  AU: { label: "address.subdivision.state", placeholder: "address.subdivisionPlaceholder.state" },
};

const GENERIC_SUBDIVISION = {
  label: "address.subdivision.region",
  placeholder: "address.subdivisionPlaceholder.region",
};

export function useAddressLabels(country: string | null | undefined): AddressLabels {
  const { t } = useTranslation();
  const cc = (country ?? "").toUpperCase();
  const sub = COUNTRY_SUBDIVISION_KEY[cc] ?? GENERIC_SUBDIVISION;
  const postal = getPostalPattern(cc);

  return {
    subdivision: t(sub.label, defaultLabel(sub.label)),
    subdivisionPlaceholder: t(sub.placeholder, defaultPlaceholder(sub.placeholder)),
    postalCode: t(
      `address.postalCode.${cc.toLowerCase() || "default"}`,
      postal?.label ?? "Postal code",
    ),
    postalCodePlaceholder: postal?.placeholder ?? "",
  };
}

// Defaults map the i18n key back to a sensible English string so the hook
// works before fr-CA / es-MX catalogue entries are filled in.
function defaultLabel(key: string): string {
  switch (key) {
    case "address.subdivision.state": return "State";
    case "address.subdivision.province": return "Province";
    case "address.subdivision.estado": return "Estado";
    case "address.subdivision.county": return "County";
    case "address.subdivision.region":
    default: return "Region";
  }
}

function defaultPlaceholder(key: string): string {
  switch (key) {
    case "address.subdivisionPlaceholder.state": return "CA";
    case "address.subdivisionPlaceholder.province": return "ON";
    case "address.subdivisionPlaceholder.estado": return "CMX";
    case "address.subdivisionPlaceholder.county": return "Greater London";
    case "address.subdivisionPlaceholder.region":
    default: return "Region";
  }
}
