/**
 * ProjectDetailsSheet — the right-side drawer surfaced via the visibility
 * icon next to the project name in the v2 editor header, the always-
 * visible visibility badge on each /studio landing-page card, and any
 * future surface that wants one-click access to "everything about this
 * project that isn't the canvas itself".
 *
 * Layout:
 *   ┌─ <project.title>                              [✕]
 *   │  [Public/Private chip]  [Resume×] [Profile×] [+ Link]
 *   ├──────────────────────────────────────────────────────
 *   │  [ Metrics | Meta ]                          ← tabs
 *   ├──────────────────────────────────────────────────────
 *   │  ...selected tab content...
 *
 * Default tab: "metrics" once a video has been rendered/published,
 * otherwise "meta" — a draft has nothing to count yet but the user
 * absolutely wants to type SEO copy. Re-derived each open so a fresh
 * render flips the default automatically.
 *
 * Status chips (visibility + subjects) used to live in the editor
 * header; they were moved here so the editor chrome stays focused on
 * the canvas and ALL project-level controls share one home (DRY).
 */

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  studioService,
  type StudioProject,
} from "@/lib/services/studio-service";
import ProjectStatusChips from "@/components/studio/shared/ProjectStatusChips";

const VideoAnalyticsDashboard = lazy(
  () => import("@/components/studio/VideoAnalyticsDashboard"),
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: StudioProject | null;
  /** Called after a successful autosave so the parent can refresh its
   *  local copy of the project (title row, chip state, etc.). */
  onChange?: (next: StudioProject) => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";
type TabKey = "metrics" | "meta";

const AUTOSAVE_DELAY_MS = 700;

/** A project has metrics-worthy data only once a video has been
 *  rendered or published. Single seam so the tab default + the empty
 *  state can't disagree. */
function hasPublishedVideo(project: StudioProject | null): boolean {
  return Boolean(project?.youtubeVideoId || project?.videoUrl);
}

export default function ProjectDetailsSheet({
  open,
  onOpenChange,
  project,
  onChange,
}: Props) {
  const { toast } = useToast();

  // SEO form state — seeded from the project on open, debounced-saved
  // back to the server while typing.
  const [metaDescription, setMetaDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [socialCardImage, setSocialCardImage] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const lastSavedRef = useRef<string>("");

  const [tab, setTab] = useState<TabKey>("meta");

  // Re-seed whenever the sheet opens for a new (or refreshed) project.
  // Default tab is recomputed here so flipping from draft → published
  // between opens lands on Metrics automatically.
  useEffect(() => {
    if (!project || !open) return;
    const next = {
      metaDescription: project.metaDescription ?? "",
      slug: project.slug ?? "",
      keywords: project.keywords ?? [],
      socialCardImage: project.socialCardImage ?? "",
    };
    setMetaDescription(next.metaDescription);
    setSlug(next.slug);
    setKeywords(next.keywords);
    setSocialCardImage(next.socialCardImage);
    lastSavedRef.current = JSON.stringify(next);
    setStatus("idle");
    setTab(hasPublishedVideo(project) ? "metrics" : "meta");
  }, [project?.id, open]);

  // Debounced autosave for SEO fields. Skips the seed run by comparing
  // serialized form state against the last-saved snapshot.
  useEffect(() => {
    if (!project || !open) return;
    const snapshot = JSON.stringify({
      metaDescription,
      slug,
      keywords,
      socialCardImage,
    });
    if (snapshot === lastSavedRef.current) return;

    setStatus("saving");
    const handle = window.setTimeout(async () => {
      try {
        const res = await studioService.saveDraft({
          name: project.title,
          projectId: project.id,
          metaDescription,
          slug,
          keywords,
          socialCardImage,
        });
        lastSavedRef.current = snapshot;
        setStatus("saved");
        if (res.data) onChange?.(res.data);
      } catch (err) {
        setStatus("error");
        toast({
          title: "Couldn't save details",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [metaDescription, slug, keywords, socialCardImage, project?.id, open]);

  // The analytics dashboard expects a videoId — mirror the resolution
  // used elsewhere (real youtubeId once published, project id as a
  // pre-publish stand-in so the empty dashboard still mounts cleanly).
  const videoId = useMemo(() => {
    if (!project) return null;
    return project.youtubeVideoId ?? project.id ?? null;
  }, [project?.id, project?.youtubeVideoId]);

  const published = hasPublishedVideo(project);

  function commitKeywordDraft() {
    const trimmed = keywordDraft.trim().replace(/,$/, "");
    if (!trimmed) {
      setKeywordDraft("");
      return;
    }
    if (keywords.includes(trimmed) || keywords.length >= 20) {
      setKeywordDraft("");
      return;
    }
    setKeywords([...keywords, trimmed.slice(0, 40)]);
    setKeywordDraft("");
  }

  function removeKeyword(value: string) {
    setKeywords(keywords.filter((k) => k !== value));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-hidden p-0 sm:max-w-2xl"
      >
        <SheetHeader className="space-y-3 border-b border-border px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-lg">
                {project?.title ?? "Project details"}
              </SheetTitle>
              <SheetDescription className="sr-only">
                SEO metadata and metrics for this video.
              </SheetDescription>
            </div>
            <SaveStatusBadge status={status} />
          </div>
          {/* Visibility + subject links + "+ Link" — moved here from
              the editor header so the chrome stays focused on the
              canvas and all project controls share one home. */}
          {project && (
            <ProjectStatusChips project={project} onChange={onChange} />
          )}
        </SheetHeader>

        {project ? (
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as TabKey)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="border-b border-border px-6 pt-3">
              <TabsList>
                <TabsTrigger value="metrics">Metrics</TabsTrigger>
                <TabsTrigger value="meta">Meta</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="metrics"
              className="mt-0 flex-1 overflow-y-auto px-6 py-5"
            >
              {published && videoId ? (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading analytics…
                    </div>
                  }
                >
                  <VideoAnalyticsDashboard videoId={videoId} />
                </Suspense>
              ) : (
                <p className="rounded-md border border-dashed border-border bg-muted/20 py-10 text-center text-sm text-muted-foreground">
                  Render and publish this video to start collecting metrics.
                </p>
              )}
            </TabsContent>

            <TabsContent
              value="meta"
              className="mt-0 flex-1 overflow-y-auto px-6 py-5"
            >
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="pds-meta">Meta description</Label>
                  <Textarea
                    id="pds-meta"
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value.slice(0, 300))}
                    placeholder="One or two sentences shown in search results and social previews."
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    {metaDescription.length}/300
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pds-slug">Slug</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">/v/</span>
                    <Input
                      id="pds-slug"
                      value={slug}
                      onChange={(e) =>
                        setSlug(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, "-")
                            .replace(/-+/g, "-")
                            .slice(0, 80),
                        )
                      }
                      placeholder="sean-hogg-promo-video"
                      className="h-9"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Lowercase letters, numbers, and hyphens. Used in the public
                    share URL.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pds-keywords">Keywords</Label>
                  <Input
                    id="pds-keywords"
                    value={keywordDraft}
                    onChange={(e) => setKeywordDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        commitKeywordDraft();
                      } else if (e.key === "Backspace" && !keywordDraft && keywords.length) {
                        removeKeyword(keywords[keywords.length - 1]);
                      }
                    }}
                    onBlur={commitKeywordDraft}
                    placeholder="Type a keyword and press Enter"
                    className="h-9"
                  />
                  {keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {keywords.map((k) => (
                        <Badge
                          key={k}
                          variant="secondary"
                          className="gap-1 pr-1"
                        >
                          <span className="truncate max-w-[12rem]">{k}</span>
                          <button
                            type="button"
                            onClick={() => removeKeyword(k)}
                            className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                            aria-label={`Remove ${k}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Up to 20 short tags. Help search and recommendation surface
                    this video.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pds-social">Social card image URL</Label>
                  <Input
                    id="pds-social"
                    type="url"
                    value={socialCardImage}
                    onChange={(e) => setSocialCardImage(e.target.value.slice(0, 500))}
                    placeholder="https://…/preview.png"
                    className="h-9"
                  />
                  <p className="text-xs text-muted-foreground">
                    1200×630 PNG/JPG works best for LinkedIn, X, and Facebook
                    previews.
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Save this project first to manage its details.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  if (status === "saving") {
    return (
      <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">
        Saved
      </span>
    );
  }
  return (
    <span className="text-xs font-normal text-destructive">
      Save failed
    </span>
  );
}
