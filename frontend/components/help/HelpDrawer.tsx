/**
 * HelpDrawer — context-aware slide-out help (v2, content-as-files).
 *
 * Mounted once in AppShell. Self-gating: renders a floating "?" trigger only
 * when the current page-context (or the `general` fallback) carries help.
 *
 * Content comes from the bundled catalog (`lib/help/content.ts`) — ZERO DB,
 * zero fetch for content. The API supplies only META: which slugs map to
 * this context (cached resolve) and optional semantic-search slug hits.
 * Keyword search runs in-memory over the bundled corpus.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { HelpCircle, Search, FileText, BookOpen, ArrowRight, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { detectContextType } from "@/lib/config/page-meta-registry";
import { helpService } from "@/lib/services/help-service";
import { helpItemsForSlugs, searchHelpLocal, type HelpItem } from "@/lib/help/content";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<string, typeof FileText> = {
  faq: HelpCircle,
  guide: BookOpen,
};

export function HelpDrawer(): JSX.Element | null {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const contextKey = detectContextType(pathname);

  // One cheap, app-wide cached membership query — pages with no help never
  // trigger the per-context resolve.
  const { data: contextsRes } = useQuery({
    queryKey: ["help-contexts"],
    queryFn: () => helpService.listActiveContexts(),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const activeContexts = contextsRes?.data?.contexts ?? [];
  const hasContextHelp = activeContexts.includes(contextKey);
  const hasGeneralHelp = activeContexts.includes("general");
  const hasAnyHelp = hasContextHelp || hasGeneralHelp;
  const resolveKey = hasContextHelp ? contextKey : "general";

  // Resolve = META only (slug list); cards come from the bundled catalog.
  const { data: resolveRes, isLoading: resolveLoading } = useQuery({
    queryKey: ["help-resolve", resolveKey],
    queryFn: () => helpService.resolve(resolveKey),
    enabled: open && hasAnyHelp,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const curated = useMemo<HelpItem[]>(
    () => helpItemsForSlugs(resolveRes?.data?.slugs ?? [], lang),
    [resolveRes, lang],
  );

  const trimmed = query.trim();
  const searching = trimmed.length >= 2;

  // Keyword search is instant + local (bundled corpus). Semantic is a META
  // call to Vectorize; when it returns hits we render those, else we keep
  // the local keyword results (graceful, zero-latency baseline).
  const localResults = useMemo<HelpItem[]>(
    () => (searching ? searchHelpLocal(trimmed, lang) : []),
    [searching, trimmed, lang],
  );
  const { data: semanticRes } = useQuery({
    queryKey: ["help-search", trimmed],
    queryFn: () => helpService.search(trimmed),
    enabled: open && searching,
    staleTime: 60 * 1000,
    retry: false,
  });
  const semanticItems = useMemo<HelpItem[]>(() => {
    const r = semanticRes?.data;
    if (!r?.semantic || r.slugs.length === 0) return [];
    return helpItemsForSlugs(r.slugs, lang);
  }, [semanticRes, lang]);

  const results = searching ? (semanticItems.length > 0 ? semanticItems : localResults) : curated;

  if (!hasAnyHelp) return null;

  function openItem(item: HelpItem): void {
    setOpen(false);
    navigate(`/help/${item.slug}`);
  }

  return (
    <>
      <Button
        type="button"
        aria-label="Open help"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-40 h-12 w-12 rounded-full shadow-lg p-0 print:hidden"
      >
        <HelpCircle className="h-6 w-6" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
          <SheetHeader className="p-5 pb-3 border-b">
            <SheetTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" /> Help
            </SheetTitle>
            <SheetDescription>
              {searching ? "Search results" : "Suggestions for this page"}
            </SheetDescription>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search help articles…"
                className="pl-9"
              />
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-3">
            {resolveLoading && !searching ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : results.length === 0 ? (
              <div className="px-2 py-10 text-center text-sm text-muted-foreground">
                {searching ? "No help articles match your search." : "No suggestions for this page yet."}
              </div>
            ) : (
              <ul className="space-y-1">
                {results.map((item) => {
                  const Icon = KIND_ICON[item.kind] ?? FileText;
                  return (
                    <li key={item.slug}>
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className={cn(
                          "w-full text-left rounded-lg p-3 transition-colors",
                          "hover:bg-muted focus:bg-muted focus:outline-none group",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm leading-snug">{item.title}</span>
                              {item.kind === "guide" && (
                                <Badge variant="secondary" className="text-[10px] uppercase">
                                  guide
                                </Badge>
                              )}
                            </div>
                            {item.summary && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {item.summary}
                              </p>
                            )}
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t p-3">
            <Button
              variant="ghost"
              className="w-full justify-between"
              onClick={() => {
                setOpen(false);
                navigate("/help");
              }}
            >
              Visit the Help Center
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
