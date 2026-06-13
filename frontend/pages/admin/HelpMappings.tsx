// eslint-page-chrome: skip — admin page; chrome is provided by <AdminLayout>
// at the route (App.tsx), matching every other pages/admin/* surface.
//
// SuperAdmin curation UI for context-aware help (#1860-adjacent). Maps
// published help articles to a page *context* (AIContextType); the
// HelpDrawer surfaces the curated set on every matching page. Reads/writes
// the SuperAdmin-gated /api/help/mappings endpoints via helpService.

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2, Plus, LifeBuoy, Search, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { helpService } from "@/lib/services/help-service";
import { useToast } from "@/hooks/use-toast";
import { AI_CONTEXT_TYPES } from "@shared/ai-context-types";
import type { HelpArticleCard, HelpContextKey, HelpMappingListItem } from "@shared/help";

export default function HelpMappings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [contextKey, setContextKey] = useState<HelpContextKey>("general");
  const [articleQuery, setArticleQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "help-mappings"],
    queryFn: () => helpService.listMappings(),
  });
  const mappings = data?.data?.mappings ?? [];

  const grouped = useMemo(() => {
    const byCtx = new Map<string, HelpMappingListItem[]>();
    for (const m of mappings) {
      const list = byCtx.get(m.contextKey) ?? [];
      list.push(m);
      byCtx.set(m.contextKey, list);
    }
    return [...byCtx.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [mappings]);

  const trimmed = articleQuery.trim();
  const { data: searchRes, isFetching: searching } = useQuery({
    queryKey: ["admin", "help-article-search", trimmed],
    queryFn: () => helpService.search(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 60 * 1000,
  });
  const candidates = searchRes?.data?.articles ?? [];

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "help-mappings"] }),
      queryClient.invalidateQueries({ queryKey: ["help-contexts"] }),
      queryClient.invalidateQueries({ queryKey: ["help-resolve"] }),
    ]);
  };

  const addMapping = useMutation({
    mutationFn: (article: HelpArticleCard) =>
      helpService.setMapping({
        contextKey,
        articleId: article.id,
        position: (grouped.find(([k]) => k === contextKey)?.[1].length ?? 0),
      }),
    onSuccess: async (_r, article) => {
      await invalidate();
      toast({ title: "Mapped", description: `"${article.title}" → ${contextKey}` });
    },
    onError: (e) =>
      toast({
        title: "Couldn't map",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      }),
  });

  const removeMapping = useMutation({
    mutationFn: (id: string) => helpService.removeMapping(id),
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Removed" });
    },
    onError: (e) =>
      toast({
        title: "Couldn't remove",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      }),
  });

  const reindex = useMutation({
    mutationFn: () => helpService.reindex(),
    onSuccess: (res) => {
      const { indexed, semantic } = res.data ?? { indexed: 0, semantic: false };
      toast({
        title: semantic ? "Semantic index rebuilt" : "Indexed (semantic inactive)",
        description: semantic
          ? `Embedded ${indexed} help articles into Vectorize.`
          : `Processed ${indexed} articles, but the Vectorize/AI bindings aren't configured — search is using keyword matching. Provision the index to enable semantic search.`,
      });
    },
    onError: (e) =>
      toast({
        title: "Reindex failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      }),
  });

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-brand-purple" />
          <h1 className="text-xl font-semibold">Context-Aware Help</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={reindex.isPending}
          onClick={() => reindex.mutate()}
        >
          {reindex.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Rebuild semantic index
        </Button>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Map published help articles to a page context. The slide-out Help drawer
        shows the curated set on every page that matches the context.
      </p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Add a mapping</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={contextKey} onValueChange={(v) => setContextKey(v as HelpContextKey)}>
              <SelectTrigger className="sm:w-56">
                <SelectValue placeholder="Page context" />
              </SelectTrigger>
              <SelectContent>
                {AI_CONTEXT_TYPES.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={articleQuery}
                onChange={(e) => setArticleQuery(e.target.value)}
                placeholder="Search published help articles to add…"
                className="pl-9"
              />
            </div>
          </div>

          {trimmed.length >= 2 && (
            <div className="rounded-lg border">
              {searching && candidates.length === 0 ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                </div>
              ) : candidates.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No matching published help articles.</p>
              ) : (
                <ul className="divide-y">
                  {candidates.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 p-2">
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {a.kind}
                      </Badge>
                      <span className="flex-1 truncate text-sm">{a.title}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1"
                        disabled={addMapping.isPending}
                        onClick={() => addMapping.mutate(a)}
                      >
                        <Plus className="h-4 w-4" /> Add
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current mappings ({mappings.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : grouped.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No mappings yet. Add one above to start surfacing help in context.
            </p>
          ) : (
            <div className="space-y-5">
              {grouped.map(([ctx, items]) => (
                <div key={ctx}>
                  <div className="mb-1 font-mono text-xs font-semibold text-brand-blue">{ctx}</div>
                  <ul className="divide-y rounded-lg border">
                    {items.map((m) => (
                      <li key={m.id} className="flex items-center gap-2 p-2">
                        <Badge variant="secondary" className="text-[10px] uppercase">
                          {m.articleKind}
                        </Badge>
                        <span className="flex-1 truncate text-sm">{m.articleTitle}</span>
                        {!m.isActive && <Badge variant="outline">inactive</Badge>}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1 text-destructive hover:text-destructive"
                          disabled={removeMapping.isPending}
                          onClick={() => removeMapping.mutate(m.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
