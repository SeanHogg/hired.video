import { useEffect, useState, type ReactNode } from "react";
import { usePageChrome } from "@/lib/seo";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import {
  canonicalMediaPath,
  publicMediaIdFrom,
} from "./legacy-public-video-path";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api-client";
import { AppShell } from "@/components/AppShell";
import {
  PublicVideoSchema,
  isReady,
  type PublicVideoPayload as PublicVideo,
} from "@/lib/studio/public-video-schema";
import ProjectPlayer from "@/components/studio/shared/ProjectPlayer";
import { publicReadyToProject } from "@/lib/studio/public-payload";
import { recordProjectView } from "@/lib/services/studio-features-service";
import { useUgcSeo } from "@/lib/seo-ugc";
import { MEDIA_KIND_UI, type MediaKind } from "@shared/media-kinds";
import { SeoFinalCta } from "@/components/landing/SeoFinalCta";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OwnerPendingActions } from "@/components/studio/watch/OwnerPendingActions";

const STATUS_TITLE =
  "font-display text-[clamp(32px,4vw,48px)] font-bold leading-none tracking-[-0.03em] text-foreground";
const TEXT_LINK = "inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline";

/** The owner's photo — their initial when there is none or it fails to load
 *  (a deleted or moved image 404s; never a broken-image icon). */
function OwnerAvatar({ src, name }: { src: string | null | undefined; name: string | null | undefined }) {
  return (
    <Avatar className="h-14 w-14 flex-none border border-border">
      {src && <AvatarImage src={src} alt={name ?? ""} className="object-cover" />}
      <AvatarFallback className="bg-accent font-display text-xl font-bold text-primary" aria-hidden="true">
        {(name?.trim() || "?")[0].toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** Centered status message (load error / pending) under the app chrome. */
function StatusPanel({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[36em] flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PublicVideoResume() {
  usePageChrome();
  const { t } = useTranslation();
  const location = useLocation();
  const params = useParams<{ videoId?: string; id?: string; mediaId?: string }>();
  const videoId = publicMediaIdFrom(params, location.pathname);
  const canonical = canonicalMediaPath(
    location.pathname,
    location.search,
    location.hash,
  );
  const [video, setVideo] = useState<PublicVideo | null>(null);
  /** i18n key of the load error, if any. */
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Bumped when the owner publishes from the pending panel — refetches. */
  const [reloadKey, setReloadKey] = useState(0);

  // SEO — single adapter call. Builder lives in lib/seo-ugc.ts
  // ("videoResume" kind) and emits owner-authored Meta-tab fields
  // (metaDescription / socialCardImage / keywords) with fallbacks to
  // the video's default title/description/thumbnail. Replaces the
  // hand-rolled applyOgTags() / setMeta() helpers that previously
  // bypassed the platform SEO defaults merge.
  useUgcSeo("videoResume", video && isReady(video) ? video : null);

  useEffect(() => {
    if (!videoId || canonical) return;
    apiClient
      .get(`/api/studio/public/${videoId}`)
      .then((res: any) => {
        // apiClient wraps response — data may be nested under res.data or be res directly
        const raw = res?.data ?? res;
        const result = PublicVideoSchema.safeParse(raw);
        if (result.success) {
          setVideo(result.data);
          if (isReady(result.data)) {
            // Authoritative view counter for the Total Views / CTR
            // denominator on the owner's analytics dashboard. The
            // per-second heatmap tracker (mounted by StudioVideoSurface
            // below) under-counts short visits because it only flushes
            // on 30s tick / beforeunload / ended.
            void recordProjectView(result.data.id, document.referrer || undefined);
          }
        } else {
          setError("seoLanding.publicVideo.loadError");
        }
      })
      .catch(() => setError("seoLanding.publicVideo.notPublic"))
      .finally(() => setLoading(false));
  }, [videoId, canonical, reloadKey]);

  if (canonical) {
    return <Navigate to={canonical} replace />;
  }

  if (loading) {
    return (
      <AppShell bgClassName="bg-background">
        <StatusPanel>
          <div
            className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"
            role="status"
            aria-label={t("status.loading")}
          />
        </StatusPanel>
      </AppShell>
    );
  }

  if (error || !video) {
    return (
      <AppShell bgClassName="bg-background">
        <StatusPanel>
          <h1 className={STATUS_TITLE}>{t("seoLanding.publicVideo.notFoundTitle")}</h1>
          <p className="text-lg text-muted-foreground">{t(error ?? "seoLanding.publicVideo.unavailable")}</p>
          <Link to="/" className={TEXT_LINK}>
            {t("seoLanding.publicVideo.backHome")}
          </Link>
        </StatusPanel>
      </AppShell>
    );
  }

  // Pending: project exists but the video isn't ready or isn't public yet.
  // Common scenario — the owner shared the link from "Copy public URL" before
  // the render finished or before flipping the visibility toggle. Show a
  // friendly placeholder instead of the generic "Video Not Found" so the
  // recipient knows to check back rather than giving up.
  if (video.pending) {
    const ownerLabel = video.ownerName || t("seoLanding.publicVideo.theCreator");
    return (
      <AppShell bgClassName="bg-background">
        <StatusPanel>
          <OwnerAvatar src={video.ownerAvatar} name={ownerLabel} />
          <h1 className={STATUS_TITLE}>{video.title || t("seoLanding.publicVideo.inProgress")}</h1>
          <p className="text-lg text-muted-foreground">
            {t("seoLanding.publicVideo.pendingBody", { owner: ownerLabel })}
          </p>
          {video.id && <OwnerPendingActions projectId={video.id} onPublished={() => setReloadKey((k) => k + 1)} />}
          <Link to="/" className={TEXT_LINK}>
            {t("seoLanding.publicVideo.backHome")}
          </Link>
        </StatusPanel>
      </AppShell>
    );
  }

  // After the pending early-return above, `video` is the ready variant —
  // narrow via the predicate so the rest of the JSX can use the full payload.
  if (!isReady(video)) return null;
  const ready = video;
  const mediaKind = (ready.mediaKind ?? "video") as MediaKind;
  const framed = mediaKind === "image" || mediaKind === "animation" || mediaKind === "cad";

  return (
    <AppShell bgClassName="bg-background">
      <main className="mx-auto flex w-full max-w-[1000px] flex-col gap-8 px-6 pb-20 pt-10">
        {/* Owner info */}
        <header className="flex items-center gap-4">
          <OwnerAvatar src={ready.ownerAvatar} name={ready.ownerName} />
          <div className="min-w-0">
            <h1 className="break-words font-display text-[clamp(28px,3.6vw,44px)] font-bold leading-[1.02] tracking-[-0.03em] text-foreground">
              {ready.title}
            </h1>
            {ready.ownerName && <p className="mt-1 text-muted-foreground">{ready.ownerName}</p>}
          </div>
        </header>

        {/* Universal media surface — routes through ProjectPlayer so the
            right runtime mounts per mediaKind (game / image / animation /
            cad / Timeline kinds). ProjectPlayer covers the eager-payload
            path so we never double-fetch — the public payload above already
            carries the parallel state columns ProjectPlayer needs. */}
        <div className={cn("overflow-hidden rounded-[20px] bg-ink", framed && "flex aspect-video items-center justify-center")}>
          <ProjectPlayer
            project={publicReadyToProject(ready)}
            eagerReady={ready}
            videoSurfaceProps={{ analyticsProjectId: ready.id }}
          />
        </div>

        {/* Description */}
        {ready.description && (
          <p className="max-w-[44em] text-lg leading-relaxed text-muted-foreground">{ready.description}</p>
        )}

        {/* #884 — the viral "Roast your resume" cross-link: a free,
            low-commitment hook (instant AI feedback) that converts passive
            viewers before the sign-up CTA. */}
        <Link to="/tools/resume-roast" className={cn(TEXT_LINK, "self-start")}>
          {t("seoLanding.publicVideo.roastLink")}
        </Link>
      </main>

      {/* CTA — kind-aware so the prompt matches what the viewer just
          watched. Anon adoption (#2212): drops the viewer straight into the
          studio — a video resume seeds the resume template; other kinds open
          a fresh draft. Save/Publish gate for sign-up in place. */}
      <SeoFinalCta
        id="public-video"
        title={t("seoLanding.publicVideo.ctaTitle", { kind: MEDIA_KIND_UI[mediaKind].badgeLabel.toLowerCase() })}
        body={t("seoLanding.publicVideo.ctaBody")}
        primary={{
          to: mediaKind === "video" ? "/studio/new?contentTemplate=resume" : "/studio/new",
          label: t("seoLanding.publicVideo.ctaButton"),
        }}
      />
    </AppShell>
  );
}
