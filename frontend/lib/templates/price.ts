// The ONE template price label: "Free" (localized) or a locale-formatted USD
// amount. Used by template cards, chips, the details sheet and the apply CTA.

import type { TFunction } from "i18next";

export function templatePriceLabel(
  t: TFunction,
  cents: number | null | undefined,
  locale?: string,
): string {
  if (!cents || cents <= 0) return t("labels.free");
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(cents / 100);
}
