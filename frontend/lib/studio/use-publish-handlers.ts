/**
 * usePublishHandlers — the ONE set of Studio publish handlers (YouTube,
 * Profile, and the social networks in SOCIAL_POST_PLATFORMS — TikTok,
 * Instagram, X, Facebook, LinkedIn). Two layers:
 *
 *   • `core` — ungated, toast-free channel posts that take an already
 *     saved/rendered project and return a `PublishOutcome`. The editor's
 *     Post panel (SharePanel) runs these for several channels in one go.
 *   • `menu` — the Save menu's gated + toasting handlers (and the
 *     "Published to" re-publish dispatcher), built on the same cores.
 *
 * Extracted from StudioEditorV2 so both surfaces share one implementation.
 * Renders no UI: a toast's action button is described as data
 * (`PublishToastActionSpec`) and drawn by the host's `renderToastAction`.
 */
import { useState, type ReactElement } from "react";
import { publicVideoPath } from "@shared/public-paths";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { trackJobSeekerStage } from "@/lib/analytics/jobseeker-funnel";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { destinationLabel } from "@/lib/studio/publish-destination-meta";
import { SOCIAL_POST_PLATFORMS, isSocialPostPlatform, type SocialPostPlatform } from "@shared/social-platforms";
import type { TikTokPostSettings } from "@shared/tiktok-post-settings";
import type { VariantSpec } from "@shared/publish-presets";
import { ensureVariant as ensureVariantFor, type VariantSource } from "@/lib/studio/publish-variants";
import type { RenderVariant } from "@/lib/services/render-variant-service";

export type PublishFailureReason = "not-connected" | "failed";

/** Flat shape (not an `ok: true | false` discriminated union): the frontend
 *  type-check runs without strictNullChecks, where boolean-literal
 *  discriminants don't narrow, so failure fields are optional instead. */
export interface PublishOutcome {
  ok: boolean;
  url: string | null;
  reason?: PublishFailureReason;
  message?: string;
}

/** A publish toast's action button, as data — the host renders it. */
export interface PublishToastActionSpec {
  altText: string;
  label: string;
  onClick: () => void;
}

export interface UsePublishHandlersArgs {
  title: string;
  persistedProject: StudioProject | null;
  setPersistedProject: (next: StudioProject) => void;
  /** Save + render + upload when the hosted MP4 is missing/stale;
   *  `onProgress` (0..1) follows the render. */
  ensureRendered: (onProgress?: (progress: number) => void) => Promise<StudioProject | null>;
  /** Persist the draft; resolves the saved row (null on failure). */
  handleSave: () => Promise<StudioProject | null>;
  /** Editor's anon gate (reason, headline, resume-action) → may proceed now. */
  gateAction: (reason: string, displayReason: string, run: () => void) => boolean;
  refreshPublications: () => Promise<void>;
  /** Opens the Post panel. TikTok and LinkedIn post from there: TikTok's
   *  settings form (privacy, interactions, disclosure) can't be skipped, and
   *  a LinkedIn post is written there (caption + "Write it for me"), so the
   *  Save menu and re-publish hand both to the panel instead of posting directly. */
  openPostPanel?: () => void;
  /** Draws a toast's action button (components/studio/share/publish-toast-action). */
  renderToastAction: (spec: PublishToastActionSpec) => ReactElement;
  /** The canvas a fitted cut is rendered from (#2045) — null / absent when
   *  this surface can't render one (then every network gets the master). */
  variantSource?: () => VariantSource | null;
}

/** Pull the server's machine-readable error code off an ApiClient error. */
function serverCodeOf(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { context?: { serverCode?: unknown }; code?: unknown };
  const code = e.context?.serverCode ?? e.code;
  return typeof code === "string" ? code : undefined;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function usePublishHandlers(args: UsePublishHandlersArgs) {
  const {
    title,
    persistedProject,
    setPersistedProject,
    ensureRendered,
    handleSave,
    gateAction,
    refreshPublications,
    openPostPanel,
    renderToastAction,
    variantSource,
  } = args;
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [republishing, setRepublishing] = useState<string | null>(null);

  const isOnProfile = persistedProject?.status === "Published";

  // ───── Core (ungated, no toasts) ─────────────────────────────────────────

  /** `shorts`: the cut is vertical and ≤ 3 min (shared/publish-presets) —
   *  YouTube files it as a Short and the server tags the title #Shorts. */
  async function postToYouTube(
    project: StudioProject,
    description = "",
    shorts = false,
    variantVideoId?: string,
  ): Promise<PublishOutcome> {
    setRepublishing("youtube");
    try {
      // The ONE social publish route: the server pulls the rendered MP4,
      // uploads via the YouTube adapter, links the watch URL on the video
      // and records the publication (one row per destination).
      const res = await studioService.publishToSocial(project.id, "youtube", {
        title,
        caption: description,
        youtube: { privacy: project.isPublic ? "public" : "unlisted", shorts },
        variantVideoId,
      });
      await refreshPublications();
      trackJobSeekerStage("published", { destination: "youtube" });
      return { ok: true, url: res.data?.publication.externalUrl ?? null };
    } catch (err) {
      if (serverCodeOf(err) === "SOCIAL_NOT_CONNECTED") return { ok: false, url: null, reason: "not-connected" };
      return { ok: false, url: null, reason: "failed", message: errorMessage(err) };
    } finally {
      setRepublishing(null);
    }
  }

  /** TikTok / Instagram / X / Facebook / LinkedIn: the server pulls the rendered MP4,
   *  posts through the platform's adapter and records the publication.
   *  TikTok also needs the creator's post settings. `variantVideoId`: the
   *  fitted cut for this network (#2045), posted instead of the master. */
  async function postToSocial(
    project: StudioProject,
    platform: SocialPostPlatform,
    caption = "",
    tiktok?: TikTokPostSettings,
    variantVideoId?: string,
  ): Promise<PublishOutcome> {
    setRepublishing(platform);
    try {
      const res = await studioService.publishToSocial(project.id, platform, { title, caption, tiktok, variantVideoId });
      await refreshPublications();
      trackJobSeekerStage("published", { destination: platform });
      return { ok: true, url: res.data?.publication.externalUrl ?? null };
    } catch (err) {
      if (serverCodeOf(err) === "SOCIAL_NOT_CONNECTED") return { ok: false, url: null, reason: "not-connected" };
      return { ok: false, url: null, reason: "failed", message: errorMessage(err) };
    } finally {
      setRepublishing(null);
    }
  }

  /** Flip the on-platform profile listing. On-platform playback hydrates the
   *  live timeline, so no MP4 render is needed — only a persisted id. */
  async function setProfileLive(projectId: string, live: boolean): Promise<PublishOutcome> {
    try {
      const res = await studioService.updateProjectStatus(projectId, live ? "published" : "exported");
      if (!res.data) return { ok: false, url: null, reason: "failed" };
      setPersistedProject(res.data);
      await refreshPublications();
      if (live) trackJobSeekerStage("published", { destination: "profile" });
      return { ok: true, url: live ? publicVideoPath(res.data.slug || projectId) : null };
    } catch (err) {
      return { ok: false, url: null, reason: "failed", message: errorMessage(err) };
    }
  }

  /** The fitted cut `spec` of a saved project (#2045): reused when stored,
   *  else rendered + hosted. Absent when this surface can't render cuts. */
  const ensureVariant = variantSource
    ? (project: StudioProject, spec: VariantSpec, onProgress?: (progress: number) => void): Promise<RenderVariant | null> => {
        const source = variantSource();
        if (!source) return Promise.resolve(null);
        return ensureVariantFor({ projectId: project.id, title, source, spec, onProgress });
      }
    : undefined;

  /** Persisted project for on-platform publishing (saves a fresh draft). */
  async function ensureSaved(): Promise<StudioProject | null> {
    if (persistedProject) return persistedProject;
    return handleSave();
  }

  // ───── Save-menu handlers (gated + toasts) ───────────────────────────────

  // A "View" toast action: absolute links open in a new tab, /v/ in-app.
  function viewAction(url: string | null | undefined) {
    if (!url) return undefined;
    return renderToastAction({
      altText: t("studio.editorV2.viewPublishedAlt"),
      label: t("studio.editorV2.viewAction"),
      onClick: () => window.open(url, url.startsWith("http") ? "_blank" : "_self"),
    });
  }

  const gatePublish = (run: () => void) =>
    gateAction(
      "publish",
      t("studio.anon.gatePublish", {
        defaultValue: "Create a free account to publish — we'll keep everything you've made.",
      }),
      run,
    );

  function toastFailure(message?: string, title = t("messages.publishFailedTitle")) {
    toast({ title, description: message ?? t("errors.unknownError"), variant: "destructive" });
  }

  async function handlePublishToYouTube() {
    if (!gatePublish(() => void handlePublishToYouTube())) return;
    const project = await ensureRendered();
    if (!project) return;
    const outcome = await postToYouTube(project);
    if (outcome.ok) {
      toast({
        title: t("messages.publishedYouTubeTitle"),
        description: outcome.url ? t("studio.editorV2.videoLiveYouTubeDesc") : t("studio.editor.videoLiveDesc"),
        action: viewAction(outcome.url),
      });
    } else if (outcome.reason === "not-connected") {
      // Actionable path: link a channel in Settings.
      toast({
        title: t("studio.editorV2.connectYouTubeTitle"),
        description: t("studio.editorV2.connectYouTubeDesc"),
        action: renderToastAction({
          altText: t("studio.editorV2.openSettingsAlt"),
          label: t("headings.settings"),
          onClick: () => navigate("/settings"),
        }),
      });
    } else {
      toastFailure(outcome.message);
    }
  }

  async function handlePublishToProfile() {
    if (!gatePublish(() => void handlePublishToProfile())) return;
    const wasOnProfile = isOnProfile;
    const saved = await ensureSaved();
    if (!saved) return;
    const outcome = await setProfileLive(saved.id, !wasOnProfile);
    if (outcome.ok) {
      toast({
        title: wasOnProfile ? t("studio.editor.removedFromProfileTitle") : t("messages.publishedProfileTitle"),
        description: wasOnProfile ? t("studio.editor.removedFromProfileDesc") : t("studio.editor.publishedProfileDesc"),
        action: viewAction(outcome.url),
      });
    } else if (outcome.message !== undefined) {
      // A missing row (no message) mirrors the old silent no-op.
      toastFailure(outcome.message, wasOnProfile ? t("studio.editor.removeFailed") : t("messages.publishFailedTitle"));
    }
  }

  async function handlePublishToSocial(platform: SocialPostPlatform) {
    // TikTok posts only from the panel; LinkedIn's post is written there when
    // the host has one, else it posts directly like the other networks.
    if (platform === "tiktok" || (platform === "linkedin" && openPostPanel)) {
      openPostPanel?.();
      return;
    }
    if (!gatePublish(() => void handlePublishToSocial(platform))) return;
    const project = await ensureRendered();
    if (!project) return;
    const outcome = await postToSocial(project, platform);
    const name = destinationLabel(platform);
    if (outcome.ok) {
      toast({ title: t("studio.share.postedTo", { name }), action: viewAction(outcome.url) });
    } else if (outcome.reason === "not-connected") {
      toast({
        title: t("studio.share.connectFirst", { name }),
        action: renderToastAction({
          altText: t("studio.editorV2.openSettingsAlt"),
          label: t("headings.settings"),
          onClick: () => navigate("/settings/connections"),
        }),
      });
    } else {
      toastFailure(outcome.message);
    }
  }

  /** Re-publish from the "Published to" list — maps the destination back to
   *  the canonical handler. Profile only fires when not already live (the
   *  handler toggles, so firing it while live would UN-publish). */
  function handleRepublish(destination: string) {
    if (destination === "youtube") void handlePublishToYouTube();
    else if (destination === "profile" && !isOnProfile) void handlePublishToProfile();
    else if (isSocialPostPlatform(destination)) void handlePublishToSocial(destination);
  }

  return {
    republishing,
    isOnProfile,
    core: { postToYouTube, postToSocial, setProfileLive, ensureRendered, ensureSaved, ensureVariant },
    menu: {
      youtube: () => void handlePublishToYouTube(),
      profile: () => void handlePublishToProfile(),
      ...socialMenuHandlers(handlePublishToSocial),
    },
    handleRepublish,
  };
}

export type PublishHandlers = ReturnType<typeof usePublishHandlers>;

/** One Save-menu handler per social network, keyed by its destination id. */
function socialMenuHandlers(run: (platform: SocialPostPlatform) => Promise<void>): Record<SocialPostPlatform, () => void> {
  return Object.fromEntries(SOCIAL_POST_PLATFORMS.map((p) => [p, () => void run(p)])) as Record<SocialPostPlatform, () => void>;
}
