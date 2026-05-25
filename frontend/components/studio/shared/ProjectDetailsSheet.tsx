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
import { BarChart3, Loader2, Megaphone, MessageSquare, Plus, Tag } from "lucide-react";

import EntityDetailsSheet, {
  type EntityDetailsSection,
} from "@/components/shared/EntityDetailsSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useEntityDetailsPermission } from "@/hooks/use-entity-details-permission";
import {
  studioService,
  type StudioProject,
  type VideoCampaign,
} from "@/lib/services/studio-service";
import ProjectStatusChips from "@/components/studio/shared/ProjectStatusChips";
import UrlPickerInput from "@/components/shared/UrlPickerInput";
import { MediaIconPicker } from "@/components/shared/MediaPicker";
import { X } from "lucide-react";
import { ArtifactAnalyticsDashboard } from "@/components/analytics";
import { MEDIA_KIND_UI, type MediaKind } from "@shared/media-kinds";
import { campaignShareUrlFor } from "@/lib/campaigns/bake-utm";

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

/** Metrics are gated on "this artifact can be viewed by a third party",
 *  which after the unified-player change (#665) means saved AND public —
 *  no webm render required. Kind-agnostic: applies to every studio
 *  MediaKind (video, podcast, voice, animation, game, comic, image). */
function isPublicArtifact(project: StudioProject | null): boolean {
  return Boolean(project?.isPublic);
}

/** Resolve the effective mediaKind for analytics + copy. Defaults to
 *  `video` because every pre-#894 row in `studio_projects` was a video
 *  before the column was added (per the zod schema default). */
function effectiveMediaKind(project: StudioProject): MediaKind {
  return (project.mediaKind ?? "video") as MediaKind;
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

  // Campaign membership for the Campaign section. Lazy-loaded on first
  // sheet open via `loadCampaignsIfNeeded()` — most users browse the
  // Metrics tab, no reason to fetch /api/studio/campaigns up front.
  const [campaigns, setCampaigns] = useState<VideoCampaign[] | null>(null);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignSaving, setCampaignSaving] = useState<string | null>(null);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [creatingCampaign, setCreatingCampaign] = useState(false);

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

  // First-load fetch of the user's campaigns. Runs once per sheet open.
  // The wrapping `useEffect` re-runs when project.id changes (the parent
  // can swap which project the sheet inspects), so re-opening for a
  // different project re-uses the same cached list.
  useEffect(() => {
    if (!project) return;
    if (campaigns !== null) return;
    let cancelled = false;
    setCampaignsLoading(true);
    studioService
      .getCampaigns()
      .then((res) => {
        if (cancelled) return;
        setCampaigns(res.data ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        // Empty list on failure so the section renders the "no campaigns yet"
        // empty state rather than spinning forever. The toast surface is
        // reserved for user-initiated actions; a silent first-load failure
        // is the right trade-off here.
        setCampaigns([]);
      })
      .finally(() => {
        if (!cancelled) setCampaignsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project?.id, campaigns]);

  async function toggleCampaignMembership(
    campaign: VideoCampaign,
    nextMember: boolean,
  ) {
    if (!project) return;
    setCampaignSaving(campaign.id);
    const nextIds = nextMember
      ? Array.from(new Set([...campaign.projectIds, project.id]))
      : campaign.projectIds.filter((id) => id !== project.id);
    try {
      const res = await studioService.updateCampaign(campaign.id, {
        projectIds: nextIds,
      });
      if (res.data) {
        setCampaigns((prev) =>
          prev ? prev.map((c) => (c.id === campaign.id ? res.data : c)) : prev,
        );
      }
    } catch (err) {
      toast({
        title: "Couldn't update campaign",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCampaignSaving(null);
    }
  }

  async function createCampaignAndAttach() {
    if (!project) return;
    const name = newCampaignName.trim();
    if (!name) return;
    setCreatingCampaign(true);
    try {
      const res = await studioService.createCampaign({
        name,
        projectIds: [project.id],
      });
      if (res.data) {
        setCampaigns((prev) => (prev ? [res.data, ...prev] : [res.data]));
        setNewCampaignName("");
        toast({
          title: "Campaign created",
          description: `"${name}" now includes this project.`,
        });
      }
    } catch (err) {
      toast({
        title: "Couldn't create campaign",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreatingCampaign(false);
    }
  }

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
  const playable = isPublicArtifact(project);
  const mediaKind = effectiveMediaKind(project);
  const kindLabel = MEDIA_KIND_UI[mediaKind].badgeLabel.toLowerCase();

  const sections: EntityDetailsSection[] = [
    {
      key: "metrics",
      label: "Metrics",
      icon: BarChart3,
      render: () =>
        playable ? (
          <ArtifactAnalyticsDashboard kind={mediaKind} artifactId={project.id} />
        ) : (
          <p className="rounded-md border border-dashed border-border bg-muted/20 py-10 text-center text-sm text-muted-foreground">
            Make this {kindLabel} public to start collecting metrics — the
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
      key: "campaign",
      label: "Campaign",
      icon: Megaphone,
      render: () => (
        <CampaignSection
          project={project}
          campaigns={campaigns}
          campaignsLoading={campaignsLoading}
          campaignSaving={campaignSaving}
          onToggleMembership={toggleCampaignMembership}
          newCampaignName={newCampaignName}
          setNewCampaignName={setNewCampaignName}
          onCreate={createCampaignAndAttach}
          creating={creatingCampaign}
        />
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

/** Lets the user attach the active project to one or more video
 *  campaigns from the same place SEO + engagement live. Reuses the
 *  existing `/api/studio/campaigns` endpoints (no new schema) — the
 *  campaign carries the project membership via its `projectIds[]`
 *  array, so a toggle here is a one-call `updateCampaign({ projectIds })`.
 *  The Outreach Campaigns tab reads the SAME list and surfaces the
 *  membership symmetrically (DRY: ONE storage location, two UIs).
 *
 *  Marketers can also spin up a new campaign inline so the studio
 *  doesn't bounce them to /outreach mid-flow. */
function CampaignSection({
  project,
  campaigns,
  campaignsLoading,
  campaignSaving,
  onToggleMembership,
  newCampaignName,
  setNewCampaignName,
  onCreate,
  creating,
}: {
  project: StudioProject;
  campaigns: VideoCampaign[] | null;
  campaignsLoading: boolean;
  campaignSaving: string | null;
  onToggleMembership: (campaign: VideoCampaign, nextMember: boolean) => Promise<void>;
  newCampaignName: string;
  setNewCampaignName: (value: string) => void;
  onCreate: () => Promise<void>;
  creating: boolean;
}) {
  if (campaignsLoading && !campaigns) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading your campaigns…
      </div>
    );
  }
  const list = campaigns ?? [];
  const memberOf = list.filter((c) => c.projectIds.includes(project.id));
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">
          Group this project with other ads, banners, and videos so the
          Outreach dashboard can roll up performance per launch, season,
          or audience. Membership is editable from either side — this
          panel or the Campaigns tab in Outreach.
        </p>
      </div>

      {memberOf.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            In these campaigns
          </Label>
          <div className="space-y-1.5">
            {memberOf.map((c) => (
              <CampaignMembershipRow
                key={c.id}
                campaign={c}
                projectId={project.id}
                saving={campaignSaving === c.id}
                onRemove={() => onToggleMembership(c, false)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Add to existing campaign
        </Label>
        {list.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/20 py-4 px-3 text-xs text-muted-foreground">
            No campaigns yet. Create one below — the Outreach tab will
            roll up performance once metrics start arriving.
          </p>
        ) : (
          <div className="space-y-1.5">
            {list
              .filter((c) => !c.projectIds.includes(project.id))
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onToggleMembership(c, true)}
                  disabled={campaignSaving === c.id}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:border-brand-purple disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.projectIds.length} project
                      {c.projectIds.length === 1 ? "" : "s"} ·{" "}
                      {c.status}
                    </p>
                  </div>
                  {campaignSaving === c.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              ))}
            {list.every((c) => c.projectIds.includes(project.id)) && list.length > 0 && (
              <p className="rounded-md border border-dashed border-border bg-muted/20 py-3 px-3 text-xs text-muted-foreground">
                This project is in every campaign you've created. Spin up
                a new one below.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="pds-new-campaign" className="text-xs uppercase tracking-wider text-muted-foreground">
          New campaign
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="pds-new-campaign"
            value={newCampaignName}
            onChange={(e) => setNewCampaignName(e.target.value.slice(0, 80))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (newCampaignName.trim()) void onCreate();
              }
            }}
            placeholder="Spring product launch"
            className="h-9"
          />
          <Button
            type="button"
            onClick={() => void onCreate()}
            disabled={!newCampaignName.trim() || creating}
            size="sm"
          >
            {creating ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Creating
              </>
            ) : (
              <>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Create
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Adds this project to the new campaign right away. Manage budget,
          UTM params, and stats in the Outreach &gt; Campaigns tab.
        </p>
      </div>
    </div>
  );
}

/** One row inside the "In these campaigns" list. Self-contained so the
 *  CampaignSection body stays flat: each row owns its remove button +
 *  its "Copy share URL with UTM" affordance. The Copy button self-gates
 *  on whether the campaign has any UTM fields set (returns null when not
 *  entitled) per the standing DRY rule. */
function CampaignMembershipRow({
  campaign,
  projectId,
  saving,
  onRemove,
}: {
  campaign: VideoCampaign;
  projectId: string;
  saving: boolean;
  onRemove: () => void;
}) {
  const { toast } = useToast();
  const hasAnyUtm = Boolean(
    campaign.utmSource || campaign.utmMedium || campaign.utmCampaign,
  );
  const utmHint = [
    campaign.utmSource && `source=${campaign.utmSource}`,
    campaign.utmMedium && `medium=${campaign.utmMedium}`,
    campaign.utmCampaign && `campaign=${campaign.utmCampaign}`,
  ]
    .filter(Boolean)
    .join(" · ");

  async function copyShareUrl() {
    const url = campaignShareUrlFor(projectId, campaign);
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Share URL copied",
        description: hasAnyUtm ? utmHint : "No UTM tags — base URL only.",
      });
    } catch {
      toast({
        title: "Couldn't copy",
        description: url,
        variant: "destructive",
      });
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{campaign.name}</p>
        {hasAnyUtm && (
          <p className="truncate text-xs text-muted-foreground">{utmHint}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={copyShareUrl}
          className="h-7 text-xs"
          title={
            hasAnyUtm
              ? "Copy share URL with UTM tags baked in"
              : "Copy share URL (no UTM tags configured on this campaign)"
          }
        >
          Copy URL
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onRemove}
          disabled={saving}
          className="h-7 w-7 p-0"
          aria-label={`Remove from ${campaign.name}`}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
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
    <span className="text-xs font-normal text-destructive">Save failed</span>
  );
}
