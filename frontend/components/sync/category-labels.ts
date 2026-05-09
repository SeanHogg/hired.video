/**
 * Vendor category → display label.
 *
 * Single source of truth for both:
 *   - The filter chip row at the top of /tools/vendor-sync.
 *   - The category chip rendered on every <VendorCard>.
 *
 * Connectors ship `category` as a stable key (`professional`, `job-board`,
 * ...); the human label lives here so a copy tweak never has to land in
 * two files. Adding a new category means: extend `VendorCategory` in the
 * backend `connectors/types.ts`, mirror it in the FE service schema, and
 * add an entry below — the rest of the UI auto-picks it up.
 */

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

export const VENDOR_CATEGORY_LABEL: Record<VendorCategory, string> = {
  professional: "Professional networks",
  "job-board": "Job boards",
  developer: "Developer profiles",
  startup: "Startup networks",
  portfolio: "Personal sites & portfolios",
};

/** Short label suitable for an in-card chip, where horizontal space is
 *  scarce. Long-form labels remain on the filter row above. */
export const VENDOR_CATEGORY_SHORT_LABEL: Record<VendorCategory, string> = {
  professional: "Professional",
  "job-board": "Job board",
  developer: "Developer",
  startup: "Startup",
  portfolio: "Portfolio",
};
