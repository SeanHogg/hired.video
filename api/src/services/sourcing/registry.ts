/**
 * Provider registry — single map from slug → SourcingProvider.
 *
 * Concrete providers are imported here so adding a new one is a single-line
 * change. The resolver consults this registry by slug only (never by class)
 * so creator-built integrations can register through the same path.
 */

import type { SourcingProvider } from "./types.js";
import { peopleDataLabsProvider } from "./providers/peopleDataLabs.js";
import { apolloProvider } from "./providers/apollo.js";
import { proxycurlProvider } from "./providers/proxycurl.js";
import { hunterProvider } from "./providers/hunter.js";
import { githubProvider } from "./providers/github.js";
import { openCorporatesProvider } from "./providers/openCorporates.js";
import { wikidataProvider } from "./providers/wikidata.js";
import { stackOverflowProvider, commonCrawlProvider } from "./providers/dumpProviders.js";

const SYSTEM_PROVIDERS: SourcingProvider[] = [
  peopleDataLabsProvider,
  apolloProvider,
  proxycurlProvider,
  hunterProvider,
  githubProvider,
  openCorporatesProvider,
  wikidataProvider,
  stackOverflowProvider,
  commonCrawlProvider,
];

const bySlug = new Map<string, SourcingProvider>(SYSTEM_PROVIDERS.map((p) => [p.slug, p]));

export function getProvider(slug: string): SourcingProvider | undefined {
  return bySlug.get(slug);
}

export function listSystemProviderSlugs(): string[] {
  return Array.from(bySlug.keys());
}
