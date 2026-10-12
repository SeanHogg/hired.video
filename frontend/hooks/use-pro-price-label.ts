// Localized Pro monthly price label for the current UI language.
// Thin hook over formatProMonthlyPrice (shared/pricing.ts).

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatProMonthlyPrice } from "@shared/pricing";

export function useProMonthlyPriceLabel(): string {
  const { i18n } = useTranslation();
  return useMemo(() => formatProMonthlyPrice(i18n.language), [i18n.language]);
}
