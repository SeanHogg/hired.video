/**
 * ProjectDetailsSheet — studio-video adapter on top of the shared
 * <EntityDetailsSheet> shell (Gap Register #1019). Same three tabs as
 * before — Metrics / Meta / Engagement — but the chrome (trigger
 * button, sheet width, status chip placement, tab strip) now matches
 * every other entity drawer in the app.
 *
 * Parent-controlled mode: the /studio landing card uses the visibility
 * badge as its trigger, so this adapter forwards `open` + `onOpenChange`
 * through to the shell via `noTrigger`. The editor header drops in
 * `<ProjectDetailsSheet project={…} />` with the built-in trigger.
 */

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { BarChart3, Loader2, MessageSquare, Tag } from "lucide-react";

import EntityDetailsSheet, {
  type EntityDetailsSection,
} from "@/components/shared/EntityDetailsSheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useEntityDetailsPermission } from "@/hooks/use-entity-details-permission";
import {
  studioService,
  type StudioProject,
} from "@/lib/services/studio-service";
import ProjectStatusChips from "@/components/studio/shared/ProjectStatusChips";
import UrlPickerInput from "@/components/shared/UrlPickerInput";
import { MediaIconPicker } from "@/components/shared/MediaPicker";
import { X } from "lucide-react";
import { ArtifactAnalyticsDashboard } from "@/components/analytics";

const EngagementToolset = lazy(
  () => import("@/components/studio/shared/EngagementToolset"),
);

interface Props {
  project: StudioProject | null;
  /** Called after a successful autosave so the parent can refresh its
   *  local copy of the project (title row, chip state, etc.). */
  onChange?: (next: StudioProject) => void;
  /** Parent-controlled open state. Pass alongside `noTrigger` when the
   *  caller renders its own trigger surface (e.g. card badge). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  noTrigger?: boolean;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 700;

/** Metrics are gated on "this video can be viewed by a third party",
 *  which after the unified-player change (#665) means saved AND public —
 *  no webm render required. */
function isPublicVideo(project: StudioProject | null): boolean {
  return Boolean(project?.isPublic);
}

export default function ProjectDetailsSheet({
  project,
  onChange,
  open,
  onOpenChange,
  noTrigger,
}: Props) {
  const { toast } = useToast();
  const perms = useEntityDetailsPermission({
    kind: "video",
    entity: project ? { id: project.id, userId: (project as any).userId } : null,
  });

  // SEO form state lives in the Meta section; autosave fires from the
  // effect below regardless of which tab is active so users don't lose
  // edits if they switch tabs mid-typing.
  const [metaDescription, setMetaDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [socialCardImage, setSocialCardImage] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const lastSavedRef = useRef<string>("");

  // Re-seed on project change.
  useEffect(() => {
    if (!project) return;
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
  }, [project?.id]);

  // Debounced autosave for SEO fields.
  useEffect(() => {
    if (!project) return;
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
  }, [metaDescription, slug, keywords, socialCardImage, project?.id]);

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

  if (!project) return null;
  const playable = isPublicVideo(project);

  const sections: EntityDetailsSection[] = [
    {
      key: "metrics",
      label: "Metrics",
      icon: BarChart3,
      render: () =>
        playable ? (
          <ArtifactAnalyticsDashboard kind="video" artifactId={project.id} />
        ) : (
          <p className="rounded-md border border-dashed border-border bg-muted/20 py-10 text-center text-sm text-muted-foreground">
            Make this video public to start collecting metrics — the
            unified player serves it without a render step.
          </p>
        ),
    },
    {
      key: "meta",
      label: "Meta",
      icon: Tag,
      render: () => (
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
                  <Badge key={k} variant="secondary" className="gap-1 pr-1">
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
              previewKind="image"
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
      ),
    },
    {
      key: "engagement",
      label: "Engagement",
      icon: MessageSquare,
      render: () => (
        <>
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
            Chapters, thumbnails, in-video lead forms, and reviewer comments.
          </p>
        </>
      ),
    },
  ];

  const chips = <ProjectStatusChips project={project} onChange={onChange} />;

  const headerAside = <SaveStatusBadge status={status} />;

  const sharedProps = {
    title: project.title ?? "Project details",
    chips,
    sections,
    layout: "tabs" as const,
    canView: perms.canViewStats,
    headerAside,
  };

  if (noTrigger) {
    return (
      <EntityDetailsSheet
        {...sharedProps}
        noTrigger
        open={open ?? false}
        onOpenChange={onOpenChange ?? (() => {})}
      />
    );
  }
  return <EntityDetailsSheet {...sharedProps} />;
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
    <span className="text-xs font-normal text-destructive">Save failed</span>
  );
}
