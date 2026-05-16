/**
 * ProjectDetailsSheet — the right-side "Details" drawer surfaced via the
 * Globe icon next to the project name in the v2 editor header AND on each
 * /studio landing-page card.
 *
 * Two stacked sections:
 *   1. SEO — meta description, slug, keywords, social card image.
 *      Debounced autosave through studioService.saveDraft (omit-vs-empty
 *      semantics — only the keys that changed are sent).
 *   2. Metrics — embeds the existing VideoAnalyticsDashboard. Self-gates
 *      to an empty state when the project hasn't been published yet
 *      (matches VideoAnalyticsSheet copy so users see one consistent
 *      "publish first" message across surfaces).
 *
 * Single source of truth — both call sites mount this component; no
 * prop-drilled `canX` booleans, the sheet decides its own gating.
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  studioService,
  type StudioProject,
} from "@/lib/services/studio-service";

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

const AUTOSAVE_DELAY_MS = 700;

export default function ProjectDetailsSheet({
  open,
  onOpenChange,
  project,
  onChange,
}: Props) {
  const { toast } = useToast();

  // Local form state — seeded from the project on open. Kept in local
  // state so typing stays snappy and we can debounce the network write.
  const [metaDescription, setMetaDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [socialCardImage, setSocialCardImage] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const lastSavedRef = useRef<string>("");

  // Re-seed whenever the sheet opens for a new (or refreshed) project.
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
  }, [project?.id, open]);

  // Debounced autosave. Skips the very first run (re-seed) by comparing
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

  // Derive the videoId the analytics dashboard expects. Mirrors the
  // existing pattern in StudioProjectActions.tsx so analytics resolves
  // against the same id whether the project has a real published video
  // or is still using the studio_project id as the stand-in.
  const videoId = useMemo(() => {
    if (!project) return null;
    return project.youtubeVideoId ?? project.id ?? null;
  }, [project?.id, project?.youtubeVideoId]);

  const hasPublishedVideo = Boolean(project?.youtubeVideoId || project?.videoUrl);

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
        className="w-full overflow-y-auto sm:max-w-2xl"
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center justify-between gap-2">
            <span className="truncate">
              {project?.title ? `Details — ${project.title}` : "Project details"}
            </span>
            <SaveStatusBadge status={status} />
          </SheetTitle>
          <SheetDescription>
            SEO metadata controls how this video shows up in search and on
            social cards. Metrics show how it's performing once published.
          </SheetDescription>
        </SheetHeader>

        {project ? (
          <div className="space-y-8">
            <section className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                SEO
              </h3>

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
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Metrics
              </h3>
              {hasPublishedVideo && videoId ? (
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
                <p className="rounded-md border border-dashed border-border bg-muted/20 py-8 text-center text-sm text-muted-foreground">
                  Render and publish this video to start collecting metrics.
                </p>
              )}
            </section>
          </div>
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
