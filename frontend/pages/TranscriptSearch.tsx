// TranscriptSearch — recruiter-facing search across video resume + async
// interview response transcripts. Closes audit gap #6 (transcripts were
// captured but unsearchable; the recruit screening UI never existed).

import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Search, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/lib/seo";
import { apiClient } from "@/lib/api-client";

interface TranscriptHit {
  source: "recording" | "async_response";
  id: string;
  userId: string | null;
  candidateId: string | null;
  videoUrl: string | null;
  excerpt: string;
  matchCount: number;
  durationMs: number | null;
  createdAt: string;
}

function highlight(excerpt: string, query: string) {
  if (!query) return excerpt;
  const parts: (string | { match: string })[] = [];
  const lower = excerpt.toLowerCase();
  const q = query.toLowerCase();
  let pos = 0;
  let next = lower.indexOf(q, pos);
  while (next !== -1) {
    if (next > pos) parts.push(excerpt.slice(pos, next));
    parts.push({ match: excerpt.slice(next, next + q.length) });
    pos = next + q.length;
    next = lower.indexOf(q, pos);
  }
  if (pos < excerpt.length) parts.push(excerpt.slice(pos));
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/40 px-0.5 rounded">
            {p.match}
          </mark>
        ),
      )}
    </>
  );
}

export default function TranscriptSearch() {
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname, {
    title: t("transcriptSearch.seo.title"),
    description: t("transcriptSearch.seo.description"),
  });  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<TranscriptHit[] | null>(null);

  const handleSearch = async () => {
    if (query.trim().length < 2) {
      toast({ title: t("errors.queryTooShort") });
      return;
    }
    setSearching(true);
    try {
      const res = await apiClient.get<{ query: string; hits: TranscriptHit[]; count: number }>(
        `/api/transcripts/search?q=${encodeURIComponent(query.trim())}`,
      );
      setHits(res.data.hits);
    } catch (e) {
      toast({
        title: t("errors.searchFailed"),
        description: (e as Error)?.message ?? t("messages.tryAgain"),
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  return (
    <AppShell bgClassName="bg-background">
<div className="p-6">
          <div>
            <div className="mb-6">
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Video className="w-7 h-7 text-primary" />
                {t("headings.videoTranscriptSearch")}
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                {t("messages.videoTranscriptSearchIntro")}
              </p>
            </div>

            <div className="flex gap-2 mb-6">
              <Input
                placeholder={t("fields.transcriptQuery.placeholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={searching || query.trim().length < 2}>
                {searching ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    {t("status.searching")}
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-1" />
                    {t("actions.search")}
                  </>
                )}
              </Button>
            </div>

            {hits === null ? (
              <p className="text-sm text-muted-foreground">
                {t("messages.transcriptSearchHint")}
              </p>
            ) : hits.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 p-10 text-center">
                <Video className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold">{t("messages.noTranscriptsMatched", { query })}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("messages.transcriptsOnlyForAutoTranscribed")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {t("labels.hitsCount", { count: hits.length })}
                </p>
                {hits.map((h) => (
                  <Card key={`${h.source}-${h.id}`}>
                    <CardContent className="pt-5 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {h.source === "recording" ? t("labels.videoResume") : t("labels.asyncInterview")}
                          </Badge>
                          <Badge variant="outline">
                            {t("labels.matchesCount", { count: h.matchCount })}
                          </Badge>
                          {h.durationMs && (
                            <span className="text-xs text-muted-foreground">
                              {Math.round(h.durationMs / 1000)}s
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(h.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">
                        {highlight(h.excerpt, query)}
                      </p>
                      {h.videoUrl && (
                        <Button asChild size="sm" variant="outline">
                          <a href={h.videoUrl} target="_blank" rel="noopener noreferrer">
                            <Video className="w-3.5 h-3.5 mr-1" />
                            {t("actions.watchVideo")}
                          </a>
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
</AppShell>
  );
}
