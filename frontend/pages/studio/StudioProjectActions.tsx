/**
 * StudioProjectActions — action cluster for the active studio project.
 *
 * Lives INLINE inside the active row of StudioSidebar's Recent list. Title
 * and status are rendered by the sidebar row itself (so the active project
 * has one source of truth in the top-left), and this component contributes
 * just the buttons:
 *
 *   ┌──────────────────────────────────────┐
 *   │  [ Save & Re-render — primary ]      │
 *   │  [⚙ render] [↗ share] [⋯ more]       │
 *   └──────────────────────────────────────┘
 *
 * All decisions about WHEN actions are reachable (e.g. Share is disabled
 * until a video exists) stay co-located with the buttons here so the
 * sidebar row stays a thin slot. Save is the only primary CTA — it runs
 * the full save → generate → render pipeline owned by the parent.
 */

import { lazy, Suspense, useState } from "react";
import {
  BarChart3,
  Check,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  Library,
  Lock,
  QrCode,
  Share2,
  Store,
  Upload,
  UserCheck,
  UserX,
  Wand2,
  MoreHorizontal,
} from "lucide-react";
import DownloadButton from "@/components/studio/DownloadButton";
import SaveButton from "@/components/studio/SaveButton";
import SubjectChipList from "@/components/studio/SubjectChipList";
import VisibilityChip from "@/components/studio/VisibilityChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StudioProjectState } from "@/types/studio";
import type { CompiledVideo } from "@/lib/compiler/types";
import type { VideoScript } from "@/types/video-script";
import { useSubscription } from "@/lib/hooks/useSubscription";

const StudioVideoEmbedSheet = lazy(
  () => import("@/components/studio/StudioVideoEmbedSheet"),
);
const QRCodeDialog = lazy(() => import("@/components/QRCodeDialog"));
const VideoAnalyticsSheet = lazy(
  () => import("@/components/studio/VideoAnalyticsSheet"),
);

interface Props {
  state: StudioProjectState;
  compiledVideo: CompiledVideo | null;
  isPublic: boolean;
  isPublishedToProfile: boolean;
  profileUrl?: string;
  /** Primary CTA — runs the full save + generate + render pipeline. */
  onSave: () => void;
  /** Threaded into SaveButton so its split-button toggles can write
   *  back into `script._meta.savePipelineDisabled`. */
  onScriptChange?: (next: VideoScript) => void;
  onPublish: () => void;
  onPublishToProfile: () => void;
  onLinkedInPublish: () => void;
  onMakePublic: (pub: boolean) => void;
  onDownloadLocal?: () => void;
  removeBranding?: boolean;
  onRemoveBrandingChange?: (next: boolean) => void;
  onPublishAsTemplate?: () => void;
  /** Clone the active project into a new Draft owned by the same user. */
  onCloneProject?: () => void;
  /** Open the slide-out panel listing the user's published marketplace templates. */
  onOpenMyTemplates?: () => void;
  /** Many-to-many subject links on the active project. Owners can unlink
   *  inline; the SubjectChipList self-hides when empty + no add handler. */
  linkedSubjects?: Array<{ kind: string; id: string }>;
  onUnlinkSubject?: (subject: { kind: "resume" | "profile" | "job" | "company" | "skills_demo"; id: string }) => void;
}

export default function StudioProjectActions({
  state,
  compiledVideo,
  isPublic,
  isPublishedToProfile,
  profileUrl,
  onSave,
  onPublish,
  onPublishToProfile,
  onLinkedInPublish,
  onMakePublic,
  onDownloadLocal,
  removeBranding = false,
  onRemoveBrandingChange,
  onPublishAsTemplate,
  onCloneProject,
  onOpenMyTemplates,
  onScriptChange,
  linkedSubjects,
  onUnlinkSubject,
}: Props) {
  // Self-gated. The branding toggle's enabled/disabled state is a Pro
  // feature check — the hook is the single primitive (with built-in SA
  // bypass), so this component decides for itself.
  const { isPro } = useSubscription();
  const busy = ["generating", "exporting", "uploading", "publishing"].includes(state.status);
  const hasVideo = state.videoBlob != null || state.videoUrl != null;
  const hasYoutube = state.youtubeVideoId != null;

  // ── Local-only dialog state for self-mounted share surfaces.
  //    Embed/QR need `isPublic`; analytics only needs `hasVideo`. Gating
  //    happens at the menu item level so the dialogs never open in an
  //    invalid state and parents don't need to thread `canX` booleans.
  const [embedOpen, setEmbedOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  // The studio embed endpoint keys off `videos.id` (a published render),
  // whereas analytics keys off `studio_projects.id` post-migration 0085.
  // `embedVideoId` gates the embed/QR controls; analytics keys on
  // `state.projectId` directly.
  const embedVideoId = state.youtubeVideoId ?? state.projectId ?? null;
  const projectId = state.projectId ?? null;
  const publicShareUrl = state.projectId
    ? `https://hired.video/v/${state.projectId}`
    : null;

  // Click-to-stop propagation on the wrapping div + dropdown triggers — the
  // active row is itself a button (clicking switches projects), so we
  // don't want clicks inside the action cluster to bubble up.
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="flex flex-col gap-1.5 mt-1.5" onClick={stop}>
      {/* Linked subjects — inline list with × to unlink. SubjectChipList
          self-hides when there's nothing to render and no add handler. */}
      {(linkedSubjects?.length ?? 0) > 0 && (
        <SubjectChipList
          subjects={linkedSubjects ?? []}
          onUnlink={onUnlinkSubject}
        />
      )}

      {/* Visibility — at-a-glance Public / Private with one-click toggle.
          Pure visibility flip after #665 — the unified player serves
          saved-but-unrendered projects, so going Public no longer needs
          to chain through a render. Render-and-publish-to-external lives
          in the Publish menu instead. Lives ABOVE Save so users see +
          control it without opening the Share dropdown. */}
      <div className="flex items-center justify-end">
        <VisibilityChip
          isPublic={isPublic}
          busy={
            state.status === "generating" ||
            state.status === "exporting" ||
            state.status === "uploading" ||
            state.status === "publishing"
          }
          onMakePublic={onMakePublic}
        />
      </div>

      {/* Save — primary CTA. SaveButton owns the busy/label/icon logic so
          the same component drops into the player row at compact size. */}
      <SaveButton state={state} onSave={onSave} onScriptChange={onScriptChange} variant="block" />

      {/* Icon row — render / [download] / share / more. Equal width so the
          cluster reads as one control group rather than loose buttons.
          Download surfaces itself when the user qualifies (Pro / creator /
          superadmin) and there's a video to download — see DownloadButton
          for the full gate. */}
      <div className="flex items-center gap-1">
        <DownloadButton
          state={state}
          onDownload={onDownloadLocal}
          iconOnly
          className="h-7 flex-1"
        />

        {/* Render options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="h-7 flex-1"
              title="Render options"
              disabled={busy}
              onClick={stop}
            >
              <Wand2 className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Render options
            </DropdownMenuLabel>
            <div
              className="px-2 py-1.5"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="row-remove-branding" className="text-xs leading-tight block">
                    Remove hired.video branding
                  </Label>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    {isPro ? (
                      "Drops the intro card, outro card, and watermark."
                    ) : (
                      <>
                        Pro plan only —{" "}
                        <a href="/pricing" className="underline hover:text-primary">
                          upgrade
                        </a>{" "}
                        to remove the intro, outro, and watermark.
                      </>
                    )}
                  </p>
                </div>
                <Switch
                  id="row-remove-branding"
                  checked={isPro ? removeBranding : false}
                  disabled={!isPro}
                  onCheckedChange={(v) => onRemoveBrandingChange?.(v)}
                />
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Share — trigger is enabled even on Draft projects so users can
            discover the Publish destinations. The handlers in StudioLayout
            run a render-on-demand (`ensureRendered`) before publishing,
            so a click on "Publish to YouTube" from a Draft now kicks off
            the render pipeline automatically instead of doing nothing. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="h-7 flex-1"
              title="Share"
              disabled={busy}
              onClick={stop}
            >
              <Share2 className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Publish
            </DropdownMenuLabel>
            {/* Plain-English explainer so the user knows what these clicks
                cost. When no video exists the actions render + upload first;
                when a video already exists they re-publish it. The Save
                dropdown's toggles intentionally don't gate these actions,
                and that's a frequent source of confusion — call it out. */}
            {!hasVideo ? (
              <p className="text-[10px] text-muted-foreground px-2 pb-1.5 leading-tight">
                No rendered video yet. Each action below will <span className="font-medium text-foreground">render + upload</span>, then publish to the chosen destination.
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground px-2 pb-1.5 leading-tight">
                Publishes the rendered video to the chosen destination.
              </p>
            )}
            <DropdownMenuItem
              onClick={onPublish}
              disabled={busy}
              title={
                hasYoutube ? "Re-publish the existing video to YouTube"
                : hasVideo  ? "Upload the existing render to YouTube"
                            : "Render the video, upload it, then publish to YouTube"
              }
            >
              <Upload className="w-3.5 h-3.5 mr-2" />
              {hasYoutube ? "Re-publish to YouTube" : hasVideo ? "Publish to YouTube" : "Render & publish to YouTube"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onLinkedInPublish}
              disabled={busy}
              title={
                hasVideo ? "Open the LinkedIn publisher with the rendered video"
                         : "Render the video, upload it, then open the LinkedIn publisher"
              }
            >
              <Share2 className="w-3.5 h-3.5 mr-2" />
              {hasVideo ? "Publish to LinkedIn" : "Render & publish to LinkedIn"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onPublishToProfile}
              disabled={busy}
              title={
                isPublishedToProfile ? "Currently on your public profile — click to remove it"
                : hasVideo            ? "Add the rendered video to your public profile"
                                      : "Render the video, upload it, and feature it on your public profile"
              }
            >
              {isPublishedToProfile ? (
                <>
                  <UserX className="w-3.5 h-3.5 mr-2" /> Remove from Profile
                </>
              ) : (
                <>
                  <UserCheck className="w-3.5 h-3.5 mr-2" />
                  {hasVideo ? "Publish to Profile" : "Render & publish to Profile"}
                </>
              )}
            </DropdownMenuItem>
            {isPublishedToProfile && profileUrl && (
              <DropdownMenuItem asChild>
                <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 mr-2" /> View Profile
                </a>
              </DropdownMenuItem>
            )}
            {hasVideo && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Visibility
                </DropdownMenuLabel>
                <div
                  className="flex items-center justify-between px-2 py-1.5 text-xs"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <span className="flex items-center gap-1.5">
                    {isPublic ? (
                      <Globe className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Lock className="w-3 h-3 text-muted-foreground" />
                    )}
                    {isPublic ? "Public" : "Make public"}
                  </span>
                  <Switch checked={isPublic} onCheckedChange={onMakePublic} />
                </div>
                {isPublic && publicShareUrl && (
                  <div
                    className="flex items-center gap-1 px-2 pb-2"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <Input
                      readOnly
                      className="h-6 text-[10px] flex-1 font-mono"
                      value={publicShareUrl}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px] shrink-0"
                      onClick={() => navigator.clipboard.writeText(publicShareUrl)}
                    >
                      Copy
                    </Button>
                  </div>
                )}
                {/* Embed + QR — only meaningful when the video is public,
                    so the items only render in that state. Keeps the
                    consumer free of `canEmbed` / `canShowQR` props. */}
                {isPublic && embedVideoId && (
                  <>
                    <DropdownMenuItem
                      onClick={() => setEmbedOpen(true)}
                      title="Copy an iframe snippet to paste into your site"
                    >
                      <Code2 className="w-3.5 h-3.5 mr-2" />
                      Embed code
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setQrOpen(true)}
                      title="Generate a QR code that links to this video"
                    >
                      <QrCode className="w-3.5 h-3.5 mr-2" />
                      QR code
                    </DropdownMenuItem>
                  </>
                )}
                {/* Analytics — gated on having a persisted project so the
                    dashboard has something to query (it self-renders an
                    empty state when no events have landed yet). */}
                {projectId && (
                  <DropdownMenuItem
                    onClick={() => setAnalyticsOpen(true)}
                    title="Views, CTA clicks, watch time, and viewer breakdown"
                  >
                    <BarChart3 className="w-3.5 h-3.5 mr-2" />
                    View analytics
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Lazy share surfaces — open state lives here so the parent never
            has to plumb `canEmbed` / `analyticsVideoId` props through. Each
            dialog returns null while closed, so the cost is just three
            booleans of state. */}
        {embedOpen && (
          <Suspense fallback={null}>
            <StudioVideoEmbedSheet
              open={embedOpen}
              onOpenChange={setEmbedOpen}
              videoId={embedVideoId}
              videoTitle={state.name}
            />
          </Suspense>
        )}
        {qrOpen && publicShareUrl && (
          <Suspense fallback={null}>
            <QRCodeDialog
              isOpen={qrOpen}
              onClose={() => setQrOpen(false)}
              url={publicShareUrl}
              title={state.name ? `QR Code — ${state.name}` : "QR Code"}
              filename={state.name ? `${state.name.replace(/\s+/g, "-")}-qr.png` : undefined}
            />
          </Suspense>
        )}
        {analyticsOpen && (
          <Suspense fallback={null}>
            <VideoAnalyticsSheet
              open={analyticsOpen}
              onOpenChange={setAnalyticsOpen}
              projectId={projectId}
              videoTitle={state.name}
              videoDurationSec={state.script?.video?.duration}
            />
          </Suspense>
        )}

        {/* More — clone, publish-as-template, future per-project actions.
            Self-gates on whether ANY menu item has a handler — keeps the
            "if no actions, no trigger" decision in one place per the DRY
            rule rather than duplicating the gate at each callsite. */}
        {(onPublishAsTemplate || onCloneProject || onOpenMyTemplates) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="h-7 flex-1"
                title="More actions"
                disabled={busy}
                onClick={stop}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {onCloneProject && (
                <DropdownMenuItem
                  onClick={onCloneProject}
                  disabled={!state.projectId}
                >
                  <Copy className="w-3.5 h-3.5 mr-2" />
                  Clone Project
                </DropdownMenuItem>
              )}
              {onPublishAsTemplate && (
                <DropdownMenuItem
                  onClick={onPublishAsTemplate}
                  disabled={!state.projectId || !state.script}
                >
                  <Store className="w-3.5 h-3.5 mr-2" />
                  Publish as Marketplace Template
                </DropdownMenuItem>
              )}
              {onOpenMyTemplates && (
                <DropdownMenuItem onClick={onOpenMyTemplates}>
                  <Library className="w-3.5 h-3.5 mr-2" />
                  My published templates
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
