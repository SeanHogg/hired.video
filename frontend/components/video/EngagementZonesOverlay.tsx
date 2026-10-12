/**
 * EngagementZonesOverlay — makes engagement-asset widgets interactive
 * during playback (#1586), over ANY player: the DOM stage
 * (CanvasStatePreview), the frame-painted fullscreen preview
 * (TimelineFramePreview) or a baked MP4. The widget itself is already
 * drawn (DOM card or painted pixels); like `CtaHotzonesOverlay`, this lays
 * transparent controls over the zones that are visible at the playhead:
 *
 *   • form            → opens the fillable form; a `requireToContinue`
 *                       form pauses playback until it is submitted
 *   • chapter marker  → seeks to the chapter's start
 *   • thumbnail stamp → "Watch" pill linking to the parent video
 *   • review pin      → opens the review thread with its root selected
 *
 * Works for signed-out viewers of a public project: the rows come from
 * `useEngagementAsset`, which picks the owner listings or the one public
 * read by audience (lib/studio/engagement/engagement-audience). A review
 * pin has no public row, so on a public surface it renders nothing.
 *
 * Self-gating: null without a project or bound zones; a zone whose artifact
 * can't be loaded (deleted, private, not readable by this viewer, or an
 * inactive form) renders no control and never gates playback.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { publicVideoPath } from "@shared/public-paths";
import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";
import {
  activeEngagementZones,
  gatingFormZone,
  type EngagementZone,
} from "@/lib/studio/engagement/engagement-zones";
import { usePlayableEngagementAsset, usePlayableFormRows } from "@/lib/studio/engagement/use-engagement-asset";
import type { PublicVideoForm } from "@/lib/services/studio-features-service";
import EngagementFormDialog from "./EngagementFormDialog";

const ReviewCommentsDialog = lazy(() => import("@/components/studio/ReviewCommentsDialog"));

export interface EngagementPlaybackControls {
  playhead: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
}

interface EngagementZonesOverlayProps {
  zones: EngagementZone[];
  projectId: string | null | undefined;
  playback: EngagementPlaybackControls;
}

export default function EngagementZonesOverlay({ zones, projectId, playback }: EngagementZonesOverlayProps) {
  // Hook-free gate first, so a canvas with no engagement widgets (the
  // common case) mounts nothing and needs no auth / query context.
  if (!projectId || zones.length === 0) return null;
  return <ReadyOverlay zones={zones} projectId={projectId} playback={playback} />;
}

function ReadyOverlay({ zones, projectId, playback }: EngagementZonesOverlayProps & { projectId: string }) {
  const [openForm, setOpenForm] = useState<PublicVideoForm | null>(null);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<ReadonlySet<string>>(() => new Set());
  const hasForms = zones.some((z) => z.kind === "video-form");
  const forms = usePlayableFormRows(projectId, hasForms);

  // The requireToContinue gate: while a required, unsubmitted form is on
  // screen, playing is not allowed — pause and put the form in front of
  // the viewer. Re-runs when they press play again with the form closed.
  const gate = forms
    ? gatingFormZone(zones, playback.playhead, (id) => !!forms.find((f) => f.id === id)?.requireToContinue, submitted)
    : null;
  const gateForm = gate ? forms?.find((f) => f.id === gate.assetId) ?? null : null;
  const { isPlaying, pause } = playback;
  useEffect(() => {
    if (!gateForm || !isPlaying) return;
    pause();
    setOpenForm(gateForm);
  }, [gateForm, isPlaying, pause]);

  const active = activeEngagementZones(zones, playback.playhead);

  return (
    <>
      {active.length > 0 && (
        <div className="pointer-events-none absolute inset-0">
          {active.map((zone) => (
            <ZoneControl
              key={zone.key}
              zone={zone}
              projectId={projectId}
              playback={playback}
              onOpenForm={(form) => {
                playback.pause();
                setOpenForm(form);
              }}
              onOpenThread={(id) => {
                playback.pause();
                setOpenThread(id);
              }}
            />
          ))}
        </div>
      )}
      <EngagementFormDialog
        form={openForm}
        timestampSec={playback.playhead}
        onOpenChange={(open) => {
          if (!open) setOpenForm(null);
        }}
        onSubmitted={(formId) => {
          setSubmitted((prev) => new Set(prev).add(formId));
          setOpenForm(null);
          playback.play();
        }}
      />
      {openThread && (
        <Suspense fallback={null}>
          <ReviewCommentsDialog
            projectId={projectId}
            currentTimeSec={playback.playhead}
            focusCommentId={openThread}
            open
            onOpenChange={(open) => {
              if (!open) setOpenThread(null);
            }}
          />
        </Suspense>
      )}
    </>
  );
}

function ZoneControl({
  zone,
  projectId,
  playback,
  onOpenForm,
  onOpenThread,
}: {
  zone: EngagementZone;
  projectId: string;
  playback: EngagementPlaybackControls;
  onOpenForm: (form: PublicVideoForm) => void;
  onOpenThread: (commentId: string) => void;
}) {
  const { t } = useTranslation();
  const asset = usePlayableEngagementAsset(zone.kind, projectId, zone.assetId);
  if (!asset) return null;
  const box = {
    left: `${zone.x * 100}%`,
    top: `${zone.y * 100}%`,
    width: `${zone.w * 100}%`,
    height: `${zone.h * 100}%`,
  };
  const hit = "pointer-events-auto absolute cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  switch (asset.kind) {
    case "video-form":
      return (
        <button
          type="button"
          className={hit}
          style={box}
          aria-label={t("studio.engagementPlayback.openForm", { title: asset.form.title })}
          onClick={() => onOpenForm(asset.form)}
        />
      );
    case "chapter-marker":
      return (
        <button
          type="button"
          className={hit}
          style={box}
          aria-label={t("studio.engagementPlayback.jumpToChapter", { title: asset.chapter.title })}
          onClick={() => {
            playback.seek(asset.chapter.startSeconds);
            playback.play();
          }}
        />
      );
    case "thumbnail-stamp":
      return (
        <div className="absolute" style={box}>
          <a
            href={publicVideoPath(projectId)}
            className="pointer-events-auto absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => playback.pause()}
          >
            <Play className="h-3 w-3" aria-hidden="true" />
            {t("studio.engagementPlayback.watchVideo")}
          </a>
        </div>
      );
    case "review-pin":
      return (
        <button
          type="button"
          className={hit}
          style={box}
          aria-label={t("studio.engagementPlayback.openThread", { author: asset.root.authorName })}
          onClick={() => onOpenThread(asset.root.id)}
        />
      );
  }
}
