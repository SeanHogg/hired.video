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
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Loader2, Megaphone, MessageSquare, Plus, RefreshCw, Send, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";

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
import PublishedToList from "@/components/studio/v2/PublishedToList";
import {
  studioService,
  type StudioProject,
  type StudioPublication,
  type VideoCampaign,
} from "@/lib/services/studio-service";
import ProjectStatusChips from "@/components/studio/shared/ProjectStatusChips";
import UrlPickerInput from "@/components/shared/UrlPickerInput";
import { MediaIconPicker } from "@/components/shared/MediaPicker";
import { X } from "lucide-react";
import { ArtifactAnalyticsDashboard } from "@/components/analytics";
import { mediaKindToArtifactKind } from "@/lib/analytics/artifact-metrics";
import { MEDIA_KIND_UI, type MediaKind } from "@shared/media-kinds";
import { campaignShareUrlFor } from "@/lib/campaigns/bake-utm";
import { studioCampaignsQueryKey } from "@/lib/campaigns/use-project-campaign";

const EngagementTab = lazy(
  () => import("@/components/engagement/EngagementTab"),
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
  /** Publication records (#1920) — where this project has been published.
   *  Supplied by the editor's shared `usePublications` so the drawer and the
   *  Save menu read the same list (DRY). When omitted/empty the "Published"
   *  tab self-hides. */
  publications?: StudioPublication[];
  /** Re-publish a destination from the drawer's full history. */
  onRepublish?: (destination: string) => void;
  /** Destination currently re-publishing — spins that row. */
  republishing?: string | null;
  /** Re-read the publication list (after a re-publish fired from here). */
  onRefreshPublications?: () => void;
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
  publications,
  onRepublish,
  republishing,
  onRefreshPublications,
}: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
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
  const [campaignsError, setCampaignsError] = useState(false);
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
        // Reconcile the slug from the authoritative save response: the server
        // carries forward the prior slug when the field is cleared and
        // uniquifies on collision (studio.ts), so the row's real slug can
        // differ from what we sent. Mirror it back into the field — otherwise
        // the UI shows "" (or a stale value) while the row keeps a slug, and
        // it silently reappears on reload (#911). Guard against clobbering a
        // slug the user kept editing during the round-trip by only adopting it
        // when the field still holds exactly what we sent.
        const savedSlug = res.data?.slug ?? slug;
        setSlug((cur) => (cur === slug ? savedSlug : cur));
        lastSavedRef.current = JSON.stringify({
          metaDescription,
          slug: savedSlug,
          keywords,
          socialCardImage,
        });
        setStatus("saved");
        if (res.data) onChange?.(res.data);
      } catch (err) {
        setStatus("error");
        toast({
          title: t("studio.projectDetails.toast.saveFailed"),
          description: err instanceof Error ? err.message : t("studio.projectDetails.unknownError"),
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
    setCampaignsError(false);
    studioService
      .getCampaigns()
      .then((res) => {
        if (cancelled) return;
        setCampaignsError(false);
        setCampaigns(res.data ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        // Keep `campaigns` null so retry can re-run this effect. A silent
        // empty list looked like "no campaigns yet" on a network failure.
        setCampaignsError(true);
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
        void queryClient.invalidateQueries({ queryKey: studioCampaignsQueryKey });
      }
    } catch (err) {
      toast({
        title: t("studio.projectDetails.toast.updateCampaignFailed"),
        description: err instanceof Error ? err.message : t("studio.projectDetails.unknownError"),
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
        void queryClient.invalidateQueries({ queryKey: studioCampaignsQueryKey });
        toast({
          title: t("studio.projectDetails.toast.campaignCreated"),
          description: t("studio.projectDetails.toast.campaignCreatedBody", { name }),
        });
      }
    } catch (err) {
      toast({
        title: t("studio.projectDetails.toast.createCampaignFailed"),
        description: err instanceof Error ? err.message : t("studio.projectDetails.unknownError"),
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
  const livePublications = (publications ?? []).filter(
    (p) => p.status === "published",
  );

  const sections: EntityDetailsSection[] = [
    // "Published" — full history of where the project has gone live, with
    // View links + Re-publish. Self-gates: the tab only appears once there's
    // at least one live publication. Same `PublishedToList` the Save menu's
    // compact section uses (DRY) — this surface just renders the `full`
    // variant with timestamps. (#1920)
    ...(livePublications.length > 0
      ? ([
          {
            key: "published",
            label: t("studio.projectDetails.tab.published"),
            icon: Send,
            render: () => (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("studio.projectDetails.publishedBody", { kindLabel })}
                </p>
                <PublishedToList
                  publications={livePublications}
                  variant="full"
                  onRepublish={
                    onRepublish
                      ? (dest) => {
                          onRepublish(dest);
                          onRefreshPublications?.();
                        }
                      : undefined
                  }
                  republishing={republishing}
                />
              </div>
            ),
          },
        ] satisfies EntityDetailsSection[])
      : []),
    {
      key: "metrics",
      label: t("studio.projectDetails.tab.metrics"),
      icon: BarChart3,
      render: () =>
        playable ? (
          <ArtifactAnalyticsDashboard kind={mediaKindToArtifactKind(mediaKind)} artifactId={project.id} />
        ) : (
          <p className="rounded-md border border-dashed border-border bg-muted/20 py-10 text-center text-sm text-muted-foreground">
            {t("studio.projectDetails.metricsPrivate", { kindLabel })}
          </p>
        ),
    },
    {
      key: "meta",
      label: t("studio.projectDetails.tab.meta"),
      icon: Tag,
      render: () => (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="pds-meta">{t("studio.projectDetails.metaDescription")}</Label>
            <Textarea
              id="pds-meta"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value.slice(0, 300))}
              placeholder={t("studio.projectDetails.metaDescriptionPlaceholder")}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              {metaDescription.length}/300
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pds-slug">{t("studio.projectDetails.slug")}</Label>
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
                placeholder={t("studio.projectDetails.slugPlaceholder")}
                className="h-9"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("studio.projectDetails.slugHelp")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pds-keywords">{t("studio.projectDetails.keywords")}</Label>
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
              placeholder={t("studio.projectDetails.keywordPlaceholder")}
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
                      aria-label={t("studio.projectDetails.removeKeyword", { k })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t("studio.projectDetails.keywordsHelp")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pds-social">{t("studio.projectDetails.socialCardImage")}</Label>
            <UrlPickerInput
              id="pds-social"
              value={socialCardImage}
              onChange={(v) => setSocialCardImage(v.slice(0, 500))}
              placeholder={t("studio.projectDetails.socialCardPlaceholder")}
              className="h-9"
              previewKind="image"
            >
              <MediaIconPicker
                accept="image"
                onPick={(url) => setSocialCardImage(url.slice(0, 500))}
                label={t("studio.projectDetails.socialCardPickerLabel")}
              />
            </UrlPickerInput>
            <p className="text-xs text-muted-foreground">
              {t("studio.projectDetails.socialCardHelp")}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "campaign",
      label: t("studio.projectDetails.tab.campaign"),
      icon: Megaphone,
      render: () => (
        <CampaignSection
          project={project}
          campaigns={campaigns}
          campaignsLoading={campaignsLoading}
          campaignsError={campaignsError}
          onRetry={() => {
            setCampaignsError(false);
            setCampaigns(null);
          }}
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
      label: t("studio.projectDetails.tab.engagement"),
      icon: MessageSquare,
      render: () => (
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("studio.projectDetails.loadingEngagement")}
            </div>
          }
        >
          <EngagementTab project={project} />
        </Suspense>
      ),
    },
  ];

  const chips = <ProjectStatusChips project={project} onChange={onChange} />;

  const headerAside = <SaveStatusBadge status={status} />;

  const sharedProps = {
    title: project.title ?? t("studio.projectDetails.titleFallback"),
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
  campaignsError,
  onRetry,
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
  campaignsError: boolean;
  onRetry: () => void;
  campaignSaving: string | null;
  onToggleMembership: (campaign: VideoCampaign, nextMember: boolean) => Promise<void>;
  newCampaignName: string;
  setNewCampaignName: (value: string) => void;
  onCreate: () => Promise<void>;
  creating: boolean;
}) {
  const { t } = useTranslation();
  if (campaignsLoading && !campaigns) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("studio.projectDetails.loadingCampaigns")}
      </div>
    );
  }
  if (campaignsError && !campaigns) {
    return (
      <div
        data-testid="campaigns-load-error"
        className="space-y-3 rounded-md border border-dashed border-border bg-muted/20 py-6 px-4 text-sm"
      >
        <p className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {t("studio.projectDetails.campaignsLoadFailed")}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {t("studio.projectDetails.retryLoad")}
        </Button>
      </div>
    );
  }
  const list = campaigns ?? [];
  const memberOf = list.filter((c) => c.projectIds.includes(project.id));
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">
          {t("studio.projectDetails.campaignIntro")}
        </p>
      </div>

      {memberOf.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("studio.projectDetails.inTheseCampaigns")}
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
          {t("studio.projectDetails.addToExistingCampaign")}
        </Label>
        {list.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/20 py-4 px-3 text-xs text-muted-foreground">
            {t("studio.projectDetails.noCampaignsYet")}
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
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:border-brand-primary disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t("studio.projectDetails.campaignProjectCount", {
                        count: c.projectIds.length,
                        status: c.status,
                      })}
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
                {t("studio.projectDetails.inEveryCampaign")}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="pds-new-campaign" className="text-xs uppercase tracking-wider text-muted-foreground">
          {t("studio.projectDetails.newCampaign")}
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
            placeholder={t("studio.projectDetails.newCampaignPlaceholder")}
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
                {t("studio.projectDetails.creating")}
              </>
            ) : (
              <>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("studio.projectDetails.create")}
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("studio.projectDetails.createCampaignHelp")}
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
  const { t } = useTranslation();
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
        title: t("studio.projectDetails.toast.shareUrlCopied"),
        description: hasAnyUtm ? utmHint : t("studio.projectDetails.toast.noUtmTags"),
      });
    } catch {
      toast({
        title: t("studio.projectDetails.toast.copyFailed"),
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
              ? t("studio.projectDetails.copyShareUrlWithUtm")
              : t("studio.projectDetails.copyShareUrlNoUtm")
          }
        >
          {t("studio.projectDetails.copyUrl")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onRemove}
          disabled={saving}
          className="h-7 w-7 p-0"
          aria-label={t("studio.projectDetails.removeFromCampaign", {
            campaignName: campaign.name,
          })}
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
  const { t } = useTranslation();
  if (status === "idle") return null;
  if (status === "saving") {
    return (
      <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t("studio.projectDetails.saving")}
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">
        {t("studio.projectDetails.saved")}
      </span>
    );
  }
  return (
    <span className="text-xs font-normal text-destructive">{t("studio.projectDetails.saveFailed")}</span>
  );
}
