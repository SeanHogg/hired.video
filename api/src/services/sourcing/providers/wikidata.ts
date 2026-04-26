/**
 * Wikidata — public-figure ingestion (executives, founders, board members).
 *
 * Endpoint: https://www.wikidata.org/w/api.php (search) +
 *          https://www.wikidata.org/wiki/Special:EntityData/{Q}.json (fetch)
 * Auth: none.
 * Cost: free.
 */

import { ProviderError, type ProviderContext, type SourcingProvider, type SourcingResult } from "../types.js";

interface WikidataSearchResponse {
  search?: Array<{ id: string; label?: string; description?: string }>;
}

export const wikidataProvider: SourcingProvider = {
  slug: "wikidata",

  isConfigured(_ctx) {
    return true;
  },

  supports(kind) {
    return kind === "name_company";
  },

  async enrich(_ctx, query) {
    if (query.kind !== "name_company") return { found: false };

    const params = new URLSearchParams({
      action: "wbsearchentities",
      search: query.name,
      language: "en",
      format: "json",
      type: "item",
    });
    const res = await fetch(`https://www.wikidata.org/w/api.php?${params.toString()}`, {
      headers: { "User-Agent": "hired.video-sourcing/1.0" },
    });
    if (!res.ok) {
      throw new ProviderError(this.slug, "HTTP_ERROR", `${res.status}`);
    }
    const json = (await res.json()) as WikidataSearchResponse;
    const top = json.search?.[0];
    if (!top) return { found: false, rawPayload: json };

    return {
      found: true,
      fullName: top.label ?? query.name,
      title: top.description,
      company: query.company,
      rawPayload: top,
    };
  },
};
