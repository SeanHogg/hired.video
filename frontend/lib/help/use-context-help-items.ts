/**
 * useContextHelpItems — the curated help items for a page context, ready to
 * render. This is the resolution the standalone HelpDrawer used, extracted so
 * the AI Brain (the single assistant after help was consolidated into it) can
 * surface context help inline — one seam, no duplication.
 *
 * DB curation (`help_mappings`) OVERRIDES the bundled `DEFAULT_HELP_MAPPING`;
 * it falls back to the default so help works with ZERO DB (fresh env, migration
 * not applied, DB hiccup). Content comes from the bundled catalog — zero DB,
 * zero network for the bodies. Returns [] until the lazy catalog has loaded.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DEFAULT_HELP_MAPPING, type HelpContextKey } from "@shared/help";
import { helpService } from "@/lib/services/help-service";
import { useHelpContent } from "./use-help-content";
import type { HelpItem } from "./content";

export function useContextHelpItems(
  contextKey: HelpContextKey,
  enabled = true,
): HelpItem[] {
  const { i18n } = useTranslation();
  // Defer the (chunked) content load until enabled — the Brain passes its
  // open state so the catalog isn't pulled into every page load.
  const help = useHelpContent(enabled);

  // Cheap, app-wide cached membership set — shared queryKey with any other
  // help consumer so react-query dedupes to one request.
  const { data: contextsRes } = useQuery({
    queryKey: ["help-contexts"],
    queryFn: () => helpService.listActiveContexts(),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const activeContexts = contextsRes?.data?.contexts ?? [];
  const hasContextHelp =
    activeContexts.includes(contextKey) || !!DEFAULT_HELP_MAPPING[contextKey];
  const resolveKey: HelpContextKey = hasContextHelp ? contextKey : "general";

  // Resolve = META only (slug list); cards come from the bundled catalog.
  const { data: resolveRes } = useQuery({
    queryKey: ["help-resolve", resolveKey],
    queryFn: () => helpService.resolve(resolveKey),
    enabled: enabled && !!help,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return useMemo<HelpItem[]>(() => {
    if (!help) return [];
    // DB curation overrides the bundled default; fall back when it's empty.
    const apiSlugs = resolveRes?.data?.slugs ?? [];
    const slugs = apiSlugs.length > 0 ? apiSlugs : DEFAULT_HELP_MAPPING[resolveKey] ?? [];
    return help.helpItemsForSlugs(slugs, i18n.language);
  }, [help, resolveRes, resolveKey, i18n.language]);
}
