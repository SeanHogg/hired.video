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
 *   │  [ Metrics | Meta | Engagement ]             ← tabs
 *   ├──────────────────────────────────────────────────────
 *   │  ...selected tab content...
 *
 * Default tab: "metrics" once the project is public (the unified
 * `<StudioPlayer/>` plays the saved JSON directly — no render step
 * required — so visibility is the only gate that matters per #665),
 * otherwise "meta" — a private draft has nothing to count yet but the
 * user absolutely wants to type SEO copy. Re-derived each open so
 * flipping visibility between opens lands on Metrics automatically.
 *
 * Status chips (visibility + subjects) used to live in the editor
 * header; they were moved here so the editor chrome stays focused on
 * the canvas and ALL project-level controls share one home (DRY).
 */

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { BarChart3, Loader2, MessageSquare, Tag, X } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import TabStrip, { type TabStripItem } from "@/components/ui/tab-strip";
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
import UrlPickerInput from "@/components/shared/UrlPickerInput";
import { MediaIconPicker } from "@/components/shared/MediaPicker";

const VideoAnalyticsDashboard = lazy(
  () => import("@/components/studio/VideoAnalyticsDashboard"),
);
const EngagementToolset = lazy(
  () => import("@/components/studio/shared/EngagementToolset"),
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
type TabKey = "metrics" | "meta" | "engagement";

const AUTOSAVE_DELAY_MS = 700;

// Tab list lifted to module scope — pure config, doesn't depend on
// component state. Same icon + label shape as PageHeader's
// PageHeaderTab so the underline strip reads identically to the
// top-level /jobs, /people, /resumes tabs.
const TAB_DEFS: TabStripItem<TabKey>[] = [
  { key: "metrics", label: "Metrics", icon: BarChart3 },
  { key: "meta", label: "Meta", icon: Tag },
  { key: "engagement", label: "Engagement", icon: MessageSquare },
];

/** Metrics are gated on "this video can be viewed by a third party",
 *  which after the unified-player change (#665) means saved AND public —
 *  no webm render required. Render+upload is only for external embeds.
 *  Single seam so the tab default + the empty state can't disagree. */
function isPublicVideo(project: StudioProject | null): boolean {
  return Boolean(project?.isPublic);
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
    setTab(isPublicVideo(project) ? "metrics" : "meta");
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

  const playable = isPublicVideo(project);

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
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Underline tab strip — same visual language as the /jobs,
                /people, /resumes top-level tabs (TabStrip is the
                shared primitive PageHeader also styles through). */}
            <div className="px-6">
              <TabStrip<TabKey>
                tabs={TAB_DEFS}
                activeKey={tab}
                onChange={setTab}
              />
            </div>

            {tab === "metrics" && (
              <div className="flex-1 overflow-y-auto px-6 py-5">
                {playable && project ? (
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading analytics…
                      </div>
                    }
                  >
                    <VideoAnalyticsDashboard projectId={project.id} />
                  </Suspense>
                ) : (
                  <p className="rounded-md border border-dashed border-border bg-muted/20 py-10 text-center text-sm text-muted-foreground">
                    Make this video public to start collecting metrics — the
                    unified player serves it without a render step.
                  </p>
                )}
              </div>
            )}

            {tab === "meta" && (
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
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
                  <UrlPickerInput
                    id="pds-social"
                    value={socialCardImage}
                    onChange={(v) => setSocialCardImage(v.slice(0, 500))}
                    placeholder="https://…/preview.png"
                    className="h-9"
                  >
                    <MediaIconPicker
                      accept="image"
                      onPick={(url) => setSocialCardImage(url.slice(0, 500))}
                      label="Upload, pick stock, or AI-generate a social card image"
                    />
                  </UrlPickerInput>
                  <p className="text-xs text-muted-foreground">
                    1200×630 PNG/JPG works best for LinkedIn, X, and Facebook
                    previews.
                  </p>
                </div>
              </div>
            )}

            {tab === "engagement" && (
              <div className="flex-1 overflow-y-auto px-6 py-5">
                {/* Same shared cluster the editor's ActionsPanel
                    mounts. No `sceneBoundaries`/duration from this
                    surface — the Chapter dialog falls back to manual
                    authoring and the Thumbnails dialog uses the
                    loaded <video>'s native duration. The toolset
                    self-gates to null when there's no projectId. */}
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading engagement tools…
                    </div>
                  }
                >
                  <EngagementToolset
                    projectId={project.id}
                    videoUrl={project.videoUrl ?? null}
                    className="grid gap-2"
                  />
                </Suspense>
                <p className="mt-4 text-xs text-muted-foreground">
                  Chapters, thumbnails, in-video lead forms, and reviewer
                  comments — each opens its own editor.
                </p>
              </div>
            )}
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
