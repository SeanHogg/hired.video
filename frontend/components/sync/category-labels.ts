/**
 * Vendor category labels.
 *
 * The category KEY is the SSoT (backend `connector.category`); the human
 * labels come from i18n. Consuming components call `useCategoryLabels()`
 * which returns translated long-form and short-form maps. This is the
 * single seam — adding a new category means: extend `VendorCategory` in
 * the backend `connectors/types.ts`, mirror it in the FE service schema,
 * add `tools.vendorSync.category.<key>` + `.<key>Short` entries to en.json
 * (and translations), and add it to `VENDOR_CATEGORY_ORDER` below.
 */

import { useTranslation } from "react-i18next";

import type { VendorConnectorListItem } from "@/lib/services/vendor-sync-service";

export type VendorCategory = VendorConnectorListItem["category"];

/** Order chips render in. Most-popular categories first so the default
 *  scan goes Professional → Job boards. */
export const VENDOR_CATEGORY_ORDER: VendorCategory[] = [
  "professional",
  "job-board",
  "developer",
  "startup",
  "portfolio",
];

const KEY_BY_CATEGORY: Record<VendorCategory, string> = {
  professional: "professional",
  "job-board": "jobBoard",
  developer: "developer",
  startup: "startup",
  portfolio: "portfolio",
};

/** Hook returning translated long-form + short-form label maps. The hook
 *  reads i18n keys under `tools.vendorSync.category.*` so a copy tweak
 *  never has to land in two files. */
export function useCategoryLabels(): {
  long: Record<VendorCategory, string>;
  short: Record<VendorCategory, string>;
} {
  const { t } = useTranslation();
  const long: Record<VendorCategory, string> = {} as Record<VendorCategory, string>;
  const short: Record<VendorCategory, string> = {} as Record<VendorCategory, string>;
  for (const cat of VENDOR_CATEGORY_ORDER) {
    const key = KEY_BY_CATEGORY[cat];
    long[cat] = t(`tools.vendorSync.category.${key}`);
    short[cat] = t(`tools.vendorSync.category.${key}Short`);
  }
  return { long, short };
}
