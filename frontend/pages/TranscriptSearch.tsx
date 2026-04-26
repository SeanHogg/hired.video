// TranscriptSearch — recruiter-facing search across video resume + async
// interview response transcripts. Closes audit gap #6 (transcripts were
// captured but unsearchable; the recruit screening UI never existed).

import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Loader2, Search, Video } from "lucide-react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSidebar } from "@/hooks/use-sidebar";
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
  useSEO(location.pathname, {
    title: "Video Transcript Search | hired.video",
    description: "Search across candidate video resume transcripts and async interview responses.",
  });
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<TranscriptHit[] | null>(null);

  const handleSearch = async () => {
    if (query.trim().length < 2) {
      toast({ title: "Query must be at least 2 characters" });
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
        title: "Search failed",
        description: (e as Error)?.message ?? "Try again.",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />

        <div className="pt-16 p-6">
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Video className="w-7 h-7 text-primary" />
                Video transcript search
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                Find candidates by what they actually said. Searches across video
                resume transcripts and async interview responses.
              </p>
            </div>

            <div className="flex gap-2 mb-6">
              <Input
                placeholder='e.g. "kubernetes" or "led a team of 12"'
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
                    Searching…
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-1" />
                    Search
                  </>
                )}
              </Button>
            </div>

            {hits === null ? (
              <p className="text-sm text-muted-foreground">
                Type a search term and hit Enter — query is case-insensitive substring match.
                Hits ranked by match count, newest first.
              </p>
            ) : hits.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 p-10 text-center">
                <Video className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold">No transcripts matched “{query}”</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Transcripts only exist for videos that have been auto-transcribed.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {hits.length} hit{hits.length === 1 ? "" : "s"}
                </p>
                {hits.map((h) => (
                  <Card key={`${h.source}-${h.id}`}>
                    <CardContent className="pt-5 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {h.source === "recording" ? "Video resume" : "Async interview"}
                          </Badge>
                          <Badge variant="outline">
                            {h.matchCount} match{h.matchCount === 1 ? "" : "es"}
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
                            Watch video
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
        <Footer />
      </div>
    </div>
  );
}
