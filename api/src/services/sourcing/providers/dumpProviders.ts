/**
 * Bulk-dump providers — Stack Overflow Data Dump, Common Crawl.
 *
 * These don't expose a per-call enrich endpoint. Instead, an offline
 * ingestion job downloads the dump, normalises rows into `sourced_people`,
 * and the resolver's first-class hit-path (cache) handles subsequent reads.
 *
 * The provider stubs below exist so the registry has a row and the
 * SuperAdmin can enable/disable + see run history; the actual ingest is
 * triggered from /admin/integrations/:id/ingest, not from runtime lookups.
 */

import type { SourcingProvider } from "../types.js";

function makeDumpProvider(slug: string): SourcingProvider {
  return {
    slug,
    isConfigured(_ctx) {
      return true; // ingestion is a separate cron path
    },
    supports(_kind) {
      return false; // bulk-dumps never satisfy a single-record lookup
    },
    async enrich(_ctx, _query) {
      return { found: false };
    },
  };
}

export const stackOverflowProvider = makeDumpProvider("stackoverflow");
export const commonCrawlProvider = makeDumpProvider("commoncrawl");
