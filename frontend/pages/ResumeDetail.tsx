import { usePageChrome } from "@/lib/seo";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  Edit,
  Eye,
  FileJson,
  FileText,
  FileType,
  Lock,
  MessageSquare,
  Monitor,
  Printer,
  RotateCcw,
  Share2,
  Store,
  User,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import AuthOverlay from "@/components/AuthOverlay";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";
import {
  applyDocumentTemplate,
  documentTemplatesForEntity,
} from "@/lib/studio/editor-v2/document-templates";
import { descriptorFromResumeDocument } from "@/lib/studio/document/resume-document-descriptor";
import EntityHubTabStrip from "@/components/EntityHubTabStrip";
import MetadataModal from "@/components/MetadataModal";
import { ResumeActionsMenu } from "@/components/ResumeActionsMenu";
import { ToolHistorySheet } from "@/components/ToolHistorySheet";
import { EmbedSheet } from "@/components/EmbedSheet";
import RenameResumeDialog from "@/components/RenameResumeDialog";
import QRCodeDialog from "@/components/QRCodeDialog";
import ShareModal from "@/components/ShareModal";
import ResumeAnalyticsDialog from "@/components/ResumeAnalyticsDialog";
import ResumeStatsSheet from "@/components/ResumeStatsSheet";
import ReportAbuseButton from "@/components/moderation/ReportAbuseButton";
import SkillNetwork from "@/components/SkillNetwork";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SplitButton } from "@/components/ui/split-button";
import { buildTemplateAssignmentContent } from "@/lib/utils/resume-template-assignment";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useResumePermissions } from "@/hooks/use-resume-permissions";
import { useArtifactViewTracking } from "@/hooks/use-artifact-view-tracking";
import { downloadResume } from "@/lib/resume-download";
import { resumeService } from "@/lib/services/resume-service";
import { resumeFeedbackService } from "@/lib/services/resume-feedback-service";
import { useUgcSeo } from "@/lib/seo-ugc";
import { studioService, type ResumeVideo } from "@/lib/services/studio-service";
import { resumeEditorPath } from "@/lib/studio/resume-editor-link";
import StudioVideoSurface from "@/components/studio/StudioVideoSurface";
import { isTemplateUnlocked } from "@/lib/template-unlocks";
import TextNarrator from "@/components/audio/TextNarrator";
import { textFromResume } from "@/lib/audio/narrator-text";
import type { Resume, ResumePrivacy, ResumeSectionMeta } from "@/types/resume";
import { MetaType } from "@/types/resume";
import {
  DEFAULT_DESCRIPTOR,
  TEMPLATE_PRESETS,
  getTemplateById,
  matchesAnyPreset,
  validateDescriptor,
  type ResumeTemplateDescriptor,
} from "@/types/resume-template";

// Extract a YouTube video id from common URL shapes (youtu.be/<id>,
// youtube.com/watch?v=<id>). Returns null for unparseable input so the
// caller can fall back to the raw URL branch.
function youTubeIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v");
    }
  } catch {}
  return null;
}

// Discriminated union so a studio-project-backed video keeps its
// project id (lazy fetch hydrates the v2 canvas) while legacy
// metaData URLs ride the same <StudioVideoSurface/> through its flat
// mode — both routes mount the SAME player chrome the public /v/:id
// page uses, so the resume header and the watch page never diverge.
type VideoSlotItem =
  | { kind: "studio"; id: string; title: string; thumbnailUrl: string | null; videoUrl: string | null; youtubeVideoId: string | null }
  | { kind: "metadata"; id: string; title: string; url: string; metaType: MetaType };

// Self-gating: returns null when there's nothing to show. Carousel
// chrome only renders when N>1; a single video mounts bare so the
// resume header reads as "the video", not "a tile in a deck".
function VideoSlot({ items }: { items: VideoSlotItem[] }) {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(0);
  if (items.length === 0) return null;
  const current = items[idx % items.length];

  // Map every item shape (studio project, metaData YouTube, metaData
  // MP4/WebM) onto a single <StudioVideoSurface/> mount. Both surfaces
  // (this one + /v/:id) now resolve to the SAME render pipeline.
  const player =
    current.kind === "studio" ? (
      <StudioVideoSurface
        mode="lazy"
        videoId={current.id}
        poster={current.thumbnailUrl}
        title={current.title}
        fallbackVideoUrl={current.videoUrl}
        fallbackYoutubeVideoId={current.youtubeVideoId}
        // #2128 — count CTA-hotzone clicks from the in-platform resume
        // watch surface too (not just /v/:id). `current.id` is the studio
        // project id the CtaHotzonesOverlay keys engagement on; without it
        // the overlay self-disables and owner analytics under-report clicks
        // that happen on the resume detail page.
        analyticsProjectId={current.id}
      />
    ) : (() => {
        // metaData: derive the flat source from the metaType.
        const ytId =
          current.metaType === MetaType.YouTube ? youTubeIdFromUrl(current.url) : null;
        if (ytId) {
          return (
            <StudioVideoSurface
              mode="flat"
              source={{ kind: "youtube", videoId: ytId }}
              title={current.title}
            />
          );
        }
        return (
          <StudioVideoSurface
            mode="flat"
            source={{ kind: "url", url: current.url }}
            title={current.title}
            controls
          />
        );
      })();

  if (items.length === 1) return player;

  return (
    <div className="relative">
      {player}
      <button
        type="button"
        aria-label={t("resumeViewer.aria.previousVideo")}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/60 text-white rounded-full p-2"
        onClick={() => setIdx((p) => (p - 1 + items.length) % items.length)}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        type="button"
        aria-label={t("resumeViewer.aria.nextVideo")}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/60 text-white rounded-full p-2"
        onClick={() => setIdx((p) => (p + 1) % items.length)}
      >
        <ChevronRight className="w-5 h-5" />
      </button>
      <div className="mt-2 text-xs opacity-80 text-center text-white">
        {t("labels.resumeDetail.videoCounter", { current: idx + 1, total: items.length })}
      </div>
    </div>
  );
}

export default function ResumeDetail() {
  usePageChrome();
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const printMode = searchParams.get("print") === "1";
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();

  const [resume, setResume] = useState<Resume | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [metadataModal, setMetadataModal] = useState<{ open: boolean; initialMetadata: ResumeSectionMeta[] }>({
    open: false,
    initialMetadata: [],
  });
  const [studioVideos, setStudioVideos] = useState<ResumeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [descriptor, setDescriptor] = useState<ResumeTemplateDescriptor>(DEFAULT_DESCRIPTOR);
  // For canvas-authored resumes (those with a saved `documentLayout`), the
  // template dropdown re-skins the LAYOUT via `applyDocumentTemplate`. Tracked
  // separately from `descriptor` (which drives the declarative renderer) and
  // set only on an explicit user pick, so the saved layout renders verbatim on
  // first load and only re-skins when the user switches templates (#1883).
  const [layoutTemplateOverrideId, setLayoutTemplateOverrideId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [requestingFeedback, setRequestingFeedback] = useState(false);
  const [editorText, setEditorText] = useState<string>(() => JSON.stringify(DEFAULT_DESCRIPTOR, null, 2));
  const [editorError, setEditorError] = useState<string | null>(null);

  useArtifactViewTracking({
    artifactKind: "resume",
    artifactId: resume?.id,
    ownerUserId: resume?.userId ?? null,
  });

  // Tool-history side panel — opened from the "..." menu. The Run-Tool
  // submenu now deep-links to each tool's full page (via the catalog),
  // so there is no inline-run dialog state to track.
  const [toolHistoryOpen, setToolHistoryOpen] = useState(false);
  // Embed side panel — opened from the "..." menu's Embed item.
  const [embedOpen, setEmbedOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const videoItems = useMemo<VideoSlotItem[]>(() => {
    const videoTypes = new Set<MetaType>([MetaType.YouTube, MetaType.VideoMP4, MetaType.VideoWebM]);
    const fromMeta: VideoSlotItem[] = (resume?.content?.metaData ?? [])
      .filter((m) => videoTypes.has(m.metaType))
      .map((m) => ({
        kind: "metadata" as const,
        id: m.id,
        title: m.name || t("headings.videoResume"),
        url: m.url,
        metaType: m.metaType,
      }));
    // Studio videos lead the carousel — primary first (the API already
    // orders desc(isProfilePrimary), desc(createdAt)). Keep the
    // project id so <StudioVideoSurface/> can hydrate the live player.
    const fromStudio: VideoSlotItem[] = studioVideos.map((v) => ({
      kind: "studio" as const,
      id: v.id,
      title: v.title || t("labels.resumeDetail.studioVideoResume"),
      thumbnailUrl: v.thumbnailUrl ?? null,
      videoUrl: v.videoUrl ?? null,
      youtubeVideoId: v.youtubeVideoId ?? null,
    }));
    return [...fromStudio, ...fromMeta];
  }, [resume, studioVideos]);

  // Pick initial template. In print mode, the export flow serialises the
  // in-flight descriptor into the print URL (`?d=…`) so the PDF matches what
  // the user was viewing — that wins. (The URL, not sessionStorage: the print
  // window is opened with `noopener` and so gets a fresh sessionStorage, never
  // a copy of the opener's.) Otherwise: URL ?template= (preview), then the
  // resume's saved default, then DEFAULT_DESCRIPTOR. Folded into one selector
  // so the async resume-load doesn't race the print effect and clobber the pick.
  const pickInitialDescriptor = (loaded: Resume | null): ResumeTemplateDescriptor => {
    if (printMode) {
      const encoded = searchParams.get("d");
      if (encoded) {
        try {
          const parsed = validateDescriptor(JSON.parse(encoded));
          if (parsed.ok) return parsed.value;
        } catch {}
      }
    }
    const requested = searchParams.get("template");
    const urlMatch = getTemplateById(requested);
    if (urlMatch) return urlMatch;
    const saved = getTemplateById(loaded?.content?.meta?.template);
    if (saved) return saved;
    return DEFAULT_DESCRIPTOR;
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setIsPrivate(false);
    (async () => {
      // Treat RESUME_PRIVATE as a terminal signal — the resume exists but the
      // caller has no access. Falling through to /embedded or /public would
      // produce the same result and waste a round-trip.
      const isPrivateErr = (e: unknown) =>
        typeof e === "object" && e !== null && (e as any).context?.serverCode === "RESUME_PRIVATE";

      let loaded: Resume | null = null;
      try {
        loaded = await resumeService.getResumeById(id);
      } catch (e1) {
        if (isPrivateErr(e1)) {
          setIsPrivate(true);
          setLoading(false);
          return;
        }
        try {
          loaded = await resumeService.getResumeForEmbed(id);
        } catch (e2) {
          if (isPrivateErr(e2)) {
            setIsPrivate(true);
            setLoading(false);
            return;
          }
          try {
            loaded = await resumeService.getPublicResume(id);
          } catch {
            loaded = null;
          }
        }
      }

      setResume(loaded);
      if (loaded) {
        const initial = pickInitialDescriptor(loaded);
        setDescriptor(initial);
        setEditorText(JSON.stringify(initial, null, 2));
      }
      setLoading(false);

      try {
        const v = await studioService.getVideosForResume(id);
        setStudioVideos(v.data ?? []);
      } catch {}
    })();
  }, [id, searchParams]);

  // Surface the owner's name as the page title for public resumes — this is
  // what shows in the print header and browser tab when a hiring manager
  // opens the shared link. Skipped for non-public resumes (the default site
  // title is fine for the owner viewing their own draft).
  useEffect(() => {
    if (!resume || resume.privacy !== "public") return;
    const ownerName = resume.content?.basics?.name?.trim();
    if (!ownerName) return;
    const previous = document.title;
    document.title = ownerName;
    return () => {
      document.title = previous;
    };
  }, [resume]);

  const applyPreset = async (preset: ResumeTemplateDescriptor) => {
    setDescriptor(preset);
    // Canvas resumes re-skin their saved layout to the picked template; the id
    // is shared between the declarative preset and the document-template option
    // (both derive from TEMPLATE_PRESETS).
    setLayoutTemplateOverrideId(preset.id);
    setEditorText(JSON.stringify(preset, null, 2));
    setEditorError(null);

    // #1945 — for a canvas-authored resume the dropdown used to re-skin only
    // the view-local preview; the saved `documentLayout` kept its old
    // templateId so reopening the studio editor (or reloading) reverted the
    // look (themed-layout drift). Persist the re-skinned layout here using the
    // SAME `applyDocumentTemplate` seam the renderer uses, so page + editor +
    // print all agree.
    if (isSample || !resume?.id) return;
    const meta = resume.content?.meta as Record<string, unknown> | undefined;
    const baseLayout = meta?.documentLayout as DocumentState | undefined;
    if (!baseLayout || baseLayout.templateId === preset.id) return;
    const option = documentTemplatesForEntity("resume").find((o) => o.id === preset.id);
    if (!option) return;
    try {
      const newLayout = applyDocumentTemplate(baseLayout, option, () => crypto.randomUUID());
      const nextData = {
        ...(resume.content as Record<string, unknown>),
        meta: { ...(meta ?? {}), documentLayout: newLayout, template: preset.id },
      };
      const updated = await resumeService.updateResumeData(resume.id, { data: nextData as any });
      setResume(updated);
    } catch (e) {
      toast({
        title: t("errors.resumeDetail.couldNotSaveTemplate"),
        description: (e as Error)?.message || t("messages.pleaseTryAgain"),
        variant: "destructive",
      });
    }
  };

  const applyEditor = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(editorText);
    } catch (e) {
      setEditorError(t("errors.resumeDetail.jsonParseError", { message: (e as Error).message }));
      return;
    }
    const result = validateDescriptor(parsed);
    if (result.ok === false) {
      setEditorError(result.error);
      return;
    }
    // Badge the design as "Custom" the moment it diverges from any stock
    // preset — preserves id/name when it happens to match a preset exactly.
    const next = matchesAnyPreset(result.value)
      ? result.value
      : { ...result.value, id: "custom", name: t("labels.resumeDetail.customTemplateName") };
    setDescriptor(next);
    setEditorText(JSON.stringify(next, null, 2));
    setEditorError(null);
  };

  // Print mode — bare resume, no chrome, auto-prints for PDF export. The
  // descriptor itself is restored in pickInitialDescriptor (above) so the
  // async load doesn't overwrite the stashed selection.
  useEffect(() => {
    if (printMode && resume && !loading) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [printMode, resume, loading]);

  // SEO + permissions are HOOKS — they must run unconditionally, before
  // the `printMode` early return below, or React sees a different hook
  // order between print and normal renders (#1871 — was a latent crash).
  // SEO builder: lib/seo-ugc.ts ("resume" kind) → ProfilePage JSON-LD.
  useUgcSeo("resume", resume);
  // Single source of truth for "what can this viewer do with this resume".
  const perms = useResumePermissions(resume);

  if (printMode) {
    if (loading || !resume) {
      return <div className="p-8 text-center text-muted-foreground">{t("messages.resumeDetail.preparingForPrint")}</div>;
    }
    return (
      <div className="print:bg-white">
        <style>{`
          @media print {
            /* Collapse the page margin so the browser has nowhere to inject
               its date / URL / page-number chrome — then re-establish the
               content breathing room as body padding. Without this, hiring
               managers receive a PDF stamped with the internal share URL
               and a print timestamp. */
            @page { margin: 0; }
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              margin: 0.5in;
            }
          }
        `}</style>
        <DeclarativeResumeRenderer resume={resume} descriptor={descriptor} />
      </div>
    );
  }

  const handleDownloadFormat = (format: "pdf" | "word" | "json" | "text") => {
    if (!id) return;
    void downloadResume({
      id,
      format,
      preloaded: resume,
      descriptor,
      skipTracking: isSample,
    });
  };
  const handlePdf = () => handleDownloadFormat("pdf");

  // Trust the server's `isOwner` flag — the local `user.id` comes from
  // `profile.id` which doesn't reliably equal the auth sub that the
  // server compared against `resume.userId`. See ResumeEditPage for the
  // 2026-04-20 bug this local comparison caused.
  const isOwner = !!resume && resume.isOwner;

  const isSample = id === "sample";

  const refreshResume = async () => {
    if (!resume?.id || isSample) return;
    try {
      const updated = await resumeService.getResumeById(resume.id);
      setResume(updated);
    } catch {}
  };

  const handleChangePrivacy = async (privacy: ResumePrivacy) => {
    if (!resume?.id) return;
    try {
      const okResp = await resumeService.setResumePrivacy(resume.id, privacy);
      if (!okResp) throw new Error(t("errors.resumes.serverRejectedPrivacy"));
      await refreshResume();
      toast({ title: t("messages.privacyUpdated"), description: t("messages.visibilitySetTo", { privacy: privacy.replace("_", " ") }) });
    } catch (e) {
      toast({ title: t("errors.privacyUpdateFailedTitle"), description: (e as Error)?.message || t("messages.pleaseTryAgain"), variant: "destructive" });
    }
  };

  const handlePromoteToMaster = async () => {
    if (!resume?.id) return;
    try {
      const okResp = await resumeService.promoteVariantToMaster(resume.id);
      if (okResp) {
        toast({ title: t("messages.promotedTitle"), description: t("messages.promotedDescription") });
        await refreshResume();
      } else {
        toast({ title: t("errors.promoteFailedTitle"), description: t("errors.promoteFailedDescription"), variant: "destructive" });
      }
    } catch (e) {
      toast({ title: t("errors.promoteFailedTitle"), description: (e as Error)?.message ?? t("errors.unexpectedError"), variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!resume?.id) return;
    try {
      await resumeService.deleteResume(resume.id);
      toast({ title: t("messages.deletedConfirmTitle"), description: t("messages.deletedConfirmDescription") });
      navigate("/resumes");
    } catch (e) {
      toast({ title: t("errors.deleteFailedTitle"), description: (e as Error)?.message || t("messages.pleaseTryAgain"), variant: "destructive" });
    }
  };

  const handleSaveMetadata = async (metadata: ResumeSectionMeta[]) => {
    if (!resume?.id) return;
    await resumeService.updateResumeMetadata(resume.id, metadata);
    await refreshResume();
  };

  // Save the currently-selected descriptor as the resume's default view OR
  // embedded view. Persists to resume.content.meta.{template|embeddedTemplate}.
  const saveTemplateAssignment = async (slot: "template" | "embeddedTemplate") => {
    if (!resume?.id || isSample) return;
    // Use the shared builder — it's the single source of truth for the
    // lowercase `meta` casing the server schema demands.
    const nextData = buildTemplateAssignmentContent(
      resume.content as Record<string, unknown>,
      slot,
      descriptor.id,
    );
    try {
      const updated = await resumeService.updateResumeData(resume.id, { data: nextData as any });
      setResume(updated);
      toast({
        title: t("messages.resumeDetail.templateAssignedTitle"),
        description: slot === "template"
          ? t("messages.resumeDetail.templateDefaultSet", { name: descriptor.name })
          : t("messages.resumeDetail.templateEmbeddedSet", { name: descriptor.name }),
      });
    } catch (e) {
      toast({ title: t("errors.resumeDetail.couldNotSaveTemplate"), description: (e as Error)?.message || t("messages.pleaseTryAgain"), variant: "destructive" });
    }
  };

  const assignedDefaultId = resume?.content?.meta?.template ?? null;
  const assignedEmbeddedId = resume?.content?.meta?.embeddedTemplate ?? null;

  return (
    <>
      <AppShell bgClassName="bg-background">
        <div className={!isAuthenticated ? "relative" : ""}>
          {!isAuthenticated && <AuthOverlay contentType="resume" title={resume?.content?.basics?.name || resume?.title || t("labels.resume")} />}

          {/* Hub-level tab strip — keeps the My Resumes / Available /
              Sourced context visible as the user navigates into a single
              resume. Falls back to "no highlight" on direct loads. */}
          {isAuthenticated && (
            <div className="px-4 sm:px-6 pt-4">
              <EntityHubTabStrip entity="resume" />
            </div>
          )}

          <div className="bg-muted/30 border-b">
            <div className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Resume status flags + scores live in a gated side
                    panel — see ResumeStatsSheet. Job seekers viewing
                    other people's resumes don't see the trigger at
                    all; owners + paid roles get a Globe button that
                    opens the details sheet. */}
                {resume && <ResumeStatsSheet resume={resume} />}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isOwner && resume && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    onClick={async () => navigate(await resumeEditorPath(resume.id))}
                    aria-label={t("labels.resumeDetail.editResume")}
                    title={t("labels.resumeDetail.editResume")}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                )}
                {isOwner && resume && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1"
                    disabled={requestingFeedback}
                    title="Share this resume for feedback"
                    onClick={async () => {
                      setRequestingFeedback(true);
                      try {
                        const created = await resumeFeedbackService.createReview({
                          resumeId: resume.id,
                          source: "self_share",
                        });
                        navigate(`/resume-review/${created.id}`);
                      } catch {
                        toast({
                          title: "Couldn't start a review",
                          description: "Please try again.",
                          variant: "destructive",
                        });
                      } finally {
                        setRequestingFeedback(false);
                      }
                    }}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Get feedback
                  </Button>
                )}
                {/* Listen-to-this-resume pill — slots inline with the
                    toolbar buttons. Self-gates: returns null when Web
                    Speech is unavailable or the resume has no
                    narratable content. */}
                {resume && (
                  <TextNarrator
                    text={textFromResume(resume)}
                    preferenceKey={`resume.${resume.id}`}
                    label={t("actions.resumeDetail.listen")}
                  />
                )}
                {resume?.userId && !isSample && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1"
                    onClick={() => navigate(`/people/${resume.userId}`)}
                    title={t("messages.resumeDetail.viewCandidateProfile")}
                  >
                    <User className="w-3.5 h-3.5" />
                    {t("actions.viewProfile")}
                  </Button>
                )}

                <SplitButton
                  label={descriptor.name}
                  icon={FileType}
                  primaryTitle={t("actions.resumeDetail.changeTemplate")}
                  chevronLabel={t("actions.resumeDetail.templateOptions")}
                  menuClassName="w-72"
                >
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                    {t("labels.resumeDetail.yourTemplates")}
                  </DropdownMenuLabel>
                  {TEMPLATE_PRESETS
                    // Show only the free default + templates this user has
                    // unlocked. Previewing other templates lives in the
                    // marketplace; this dropdown is for applying templates
                    // the user can actually use.
                    .filter(
                      (preset) =>
                        preset.id === DEFAULT_DESCRIPTOR.id ||
                        isTemplateUnlocked(preset.id),
                    )
                    .map((preset) => {
                      const isCurrent = descriptor.id === preset.id;
                      const isAssignedDefault = assignedDefaultId === preset.id;
                      const isAssignedEmbedded = assignedEmbeddedId === preset.id;
                      return (
                        <DropdownMenuItem
                          key={preset.id}
                          onClick={() => applyPreset(preset)}
                          className={isCurrent ? "bg-accent" : ""}
                        >
                          <div className="flex flex-col flex-1 min-w-0 gap-0.5">
                            <span className="font-medium truncate">{preset.name}</span>
                            <span className="text-xs text-muted-foreground truncate">
                              {preset.industry}
                            </span>
                            {(isAssignedDefault || isAssignedEmbedded) && (
                              <span className="flex items-center gap-1 mt-0.5">
                                {isAssignedDefault && (
                                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                    <Eye className="w-3 h-3" />{t("labels.resumeDetail.defaultView")}
                                  </span>
                                )}
                                {isAssignedEmbedded && (
                                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                    <Monitor className="w-3 h-3" />{t("labels.resumeDetail.embedded")}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </DropdownMenuItem>
                      );
                    })}
                  {isOwner && !isSample && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                        {t("labels.resumeDetail.assignTemplate", { name: descriptor.name })}
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() => saveTemplateAssignment("template")}
                        disabled={assignedDefaultId === descriptor.id || descriptor.id === "custom"}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        {t("actions.resumeDetail.setAsDefaultView")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => saveTemplateAssignment("embeddedTemplate")}
                        disabled={assignedEmbeddedId === descriptor.id || descriptor.id === "custom"}
                      >
                        <Monitor className="w-4 h-4 mr-2" />
                        {t("actions.resumeDetail.setAsEmbeddedView")}
                      </DropdownMenuItem>
                    </>
                  )}
                  {perms.canEditTemplate && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setEditorOpen((v) => !v)}>
                        <Code2 className="w-4 h-4 mr-2" />
                        {editorOpen ? t("actions.resumeDetail.hideTemplateEditor") : t("actions.resumeDetail.editTemplateDesign")}
                      </DropdownMenuItem>
                    </>
                  )}
                  <div className="p-1 pt-2">
                    <Button size="sm" className="w-full" onClick={() => navigate("/search?category=templates")}>
                      <Store className="w-4 h-4 mr-1" />
                      {t("actions.resumeDetail.browseMarketplace")}
                    </Button>
                  </div>
                </SplitButton>

                {/* Export — gated to owners, recruiters, employers. Job
                    seekers viewing other people's resumes can't download. */}
                {perms.canExport && (
                  <SplitButton
                    label={t("actions.export")}
                    icon={Download}
                    onPrimary={handlePdf}
                    disabled={!resume}
                    primaryTitle={t("actions.resumeDetail.exportAsPdf")}
                    chevronLabel={t("actions.resumeDetail.exportOptions")}
                  >
                    <DropdownMenuItem onClick={handlePdf} disabled={!resume}>
                      <Printer className="w-4 h-4 mr-2" />{t("actions.resumeDetail.exportPdfBrowser")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDownloadFormat("word")} disabled={!resume}>
                      <FileType className="w-4 h-4 mr-2" />{t("actions.resumeDetail.exportWord")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleDownloadFormat("text")} disabled={!resume}>
                      <FileText className="w-4 h-4 mr-2" />{t("actions.resumeDetail.exportText")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDownloadFormat("json")} disabled={!resume}>
                      <FileJson className="w-4 h-4 mr-2" />{t("actions.resumeDetail.exportJson")}
                    </DropdownMenuItem>
                  </SplitButton>
                )}

                {resume && !isSample && (
                  <ResumeActionsMenu
                    resumeId={resume.id}
                    isOwner={isOwner}
                    isActive={resume.isActive}
                    isMaster={resume.isMaster}
                    parentId={resume.parentId}
                    onEdit={async () => navigate(await resumeEditorPath(resume.id))}
                    onRename={perms.canRename ? () => setRenameOpen(true) : undefined}
                    onAddMedia={() => setMetadataModal({ open: true, initialMetadata: resume.content.metaData || [] })}
                    onShare={() => setShareOpen(true)}
                    onCopyLink={async () => {
                      try {
                        await navigator.clipboard.writeText(window.location.href);
                        toast({ title: t("messages.linkCopiedTitle"), description: window.location.href });
                      } catch {
                        toast({ title: t("errors.couldNotCopyTitle"), description: t("errors.couldNotCopyDesc"), variant: "destructive" });
                      }
                    }}
                    onShowQR={() => setQrOpen(true)}
                    onEmbed={perms.canEmbed ? () => setEmbedOpen(true) : undefined}
                    onDownload={perms.canExport ? handleDownloadFormat : undefined}
                    onChangePrivacy={isOwner ? handleChangePrivacy : undefined}
                    onPromoteToMaster={perms.canPromoteToMaster ? handlePromoteToMaster : undefined}
                    onDelete={perms.canDelete ? handleDelete : undefined}
                    onViewToolHistory={() => setToolHistoryOpen(true)}
                    onViewAnalytics={perms.canViewAnalytics ? () => setAnalyticsOpen(true) : undefined}
                    triggerVariant="outline"
                  />
                )}
                {/* Report this resume — self-gates (hidden for the
                    owner, bounces anon to /login). entityId is the real
                    resume_information id the backend resolver expects. */}
                {resume && !isSample && (
                  <ReportAbuseButton
                    entityType="resume"
                    entityId={resume.id}
                    entityOwnerId={resume.userId}
                    entityLabel={t("resumeDetail.reportEntityLabel")}
                    triggerVariant="outline"
                  />
                )}
              </div>
            </div>
          </div>

          {loading && (
            <div className="px-6 py-12">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-muted rounded w-1/3" />
                <div className="h-48 bg-muted rounded" />
                <div className="h-4 bg-muted rounded w-3/4" />
              </div>
            </div>
          )}

          {!loading && !resume && isPrivate && (
            <div className="px-6 py-16 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-muted-foreground" />
              </div>
              <h1 className="text-2xl font-bold mb-3">{t("headings.resumeDetail.privateTitle")}</h1>
              <p className="text-muted-foreground mb-6">
                {t("messages.resumeDetail.privateBody")}
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(window.location.href)}>
                  <Share2 className="w-4 h-4 mr-1" />{t("actions.resumeDetail.copyLinkToSendOwner")}
                </Button>
                <Button onClick={() => navigate("/resumes")}>{t("actions.backToResumes")}</Button>
              </div>
            </div>
          )}

          {!loading && !resume && !isPrivate && (
            <div className="px-6 py-12 text-center">
              <h1 className="text-2xl font-bold mb-4">{t("headings.resumeDetail.notFoundTitle")}</h1>
              <p className="text-muted-foreground mb-6">{t("messages.resumeDetail.couldNotLoad")} <code>{id}</code>.</p>
              <Button onClick={() => navigate("/resumes")}><ArrowLeft className="w-4 h-4 mr-2" />{t("actions.backToResumes")}</Button>
            </div>
          )}

          {resume && (
            <div className="flex">
              <div className="flex-1 min-w-0">
                {(() => {
                  // ONE render engine for resumes — the declarative renderer
                  // (columns, themes, hero, per-section layout). The studio
                  // preview + the PDF export use this same engine via the
                  // DocumentState→descriptor bridge, so the page, the canvas
                  // preview, and the print can never drift.
                  //
                  // For a canvas-authored resume (saved `documentLayout`) the
                  // descriptor is bridged from that layout — recovering the
                  // template's two-column structure that the canvas state alone
                  // doesn't model. The dropdown re-skin (#1883) applies the
                  // picked template to the layout before bridging. Resumes
                  // without a layout use the descriptor resolved from
                  // `content.meta.template`.
                  const baseLayout = (
                    resume.content?.meta as Record<string, unknown> | undefined
                  )?.documentLayout as DocumentState | undefined;
                  let activeDescriptor = descriptor;
                  if (baseLayout) {
                    let layout = baseLayout;
                    if (
                      layoutTemplateOverrideId &&
                      layoutTemplateOverrideId !== baseLayout.templateId
                    ) {
                      const option = documentTemplatesForEntity("resume").find(
                        (o) => o.id === layoutTemplateOverrideId,
                      );
                      if (option) {
                        layout = applyDocumentTemplate(
                          baseLayout,
                          option,
                          () => crypto.randomUUID(),
                        );
                      }
                    }
                    activeDescriptor = descriptorFromResumeDocument(layout);
                  }
                  return (
                    <DeclarativeResumeRenderer
                      resume={resume}
                      descriptor={activeDescriptor}
                      videoSlot={<VideoSlot items={videoItems} />}
                      isOwner={isOwner}
                      onEditSection={async () =>
                        navigate(await resumeEditorPath(resume.id))
                      }
                    />
                  );
                })()}
                <div className="px-4 sm:px-6 pb-8">
                  <SkillNetwork
                    resumeData={resume.content}
                    resumeId={resume.id}
                    ownerUserId={resume.userId}
                    onResumeUpdated={refreshResume}
                  />
                </div>
              </div>

              {editorOpen && (
                <aside className="hidden lg:block w-[420px] shrink-0 border-l bg-card sticky top-16 self-start max-h-[calc(100vh-4rem)] overflow-auto">
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">{t("headings.resumeDetail.templateDesign")}</h3>
                      <Button size="sm" variant="ghost" onClick={() => applyPreset(DEFAULT_DESCRIPTOR)}>
                        <RotateCcw className="w-4 h-4 mr-1" />{t("actions.reset")}
                      </Button>
                    </div>
                    <textarea
                      className="w-full h-[60vh] font-mono text-xs p-3 border rounded bg-background"
                      value={editorText}
                      onChange={(e) => setEditorText(e.target.value)}
                    />
                    {editorError && (
                      <div className="text-sm text-destructive whitespace-pre-wrap">{editorError}</div>
                    )}
                    <Button size="sm" className="w-full" onClick={applyEditor}>{t("headings.apply")}</Button>
                    <p className="text-xs text-muted-foreground">
                      {t("messages.resumeDetail.customDesignNote")}
                    </p>
                  </div>
                </aside>
              )}
            </div>
          )}

        </div>
      </AppShell>

      {resume && !isSample && (
        <MetadataModal
          open={metadataModal.open}
          onOpenChange={(open) => setMetadataModal((prev) => ({ ...prev, open }))}
          resumeId={resume.id}
          initialMetadata={metadataModal.initialMetadata}
          onSave={handleSaveMetadata}
        />
      )}

      {resume && !isSample && isOwner && (
        <ToolHistorySheet
          open={toolHistoryOpen}
          onOpenChange={setToolHistoryOpen}
          source={{ kind: "entity", entityType: "resume", entityId: resume.id }}
          entityName={resume.title}
        />
      )}

      {resume && !isSample && (() => {
        const embedUrl = `${window.location.origin}/embedded/resumes/${resume.id}`;
        const titleAttr = resume.title ? ` title="${resume.title.replace(/"/g, "&quot;")}"` : "";
        const snippet = `<iframe src="${embedUrl}" width="100%" height="900" frameborder="0" loading="lazy"${titleAttr}></iframe>`;
        return (
          <EmbedSheet
            open={embedOpen}
            onOpenChange={setEmbedOpen}
            snippet={snippet}
            previewUrl={embedUrl}
            heading={t("headings.resumeDetail.embedThisResume")}
            description={t("messages.resumeDetail.embedDescription")}
          />
        );
      })()}

      {resume && !isSample && isOwner && (
        <RenameResumeDialog
          isOpen={renameOpen}
          onClose={() => setRenameOpen(false)}
          resumeId={resume.id}
          currentName={resume.title}
          onRenamed={(newName) => setResume((prev) => (prev ? { ...prev, title: newName } : prev))}
        />
      )}

      {resume && (
        <QRCodeDialog
          isOpen={qrOpen}
          onClose={() => setQrOpen(false)}
          url={window.location.href}
          title={t("labels.resumeDetail.qrCodeTitle", { name: resume.title })}
          filename={`resume-${resume.id}-qr`}
        />
      )}

      {resume && (
        <ShareModal
          open={shareOpen}
          onOpenChange={setShareOpen}
          shareUrl={window.location.href}
          title={t("labels.resumeDetail.shareTitle", { name: resume.title })}
          message={t("messages.resumeDetail.shareMessage")}
          shareText={t("messages.resumeDetail.shareText", { name: resume.title })}
        />
      )}

      {resume && !isSample && isOwner && (
        <ResumeAnalyticsDialog
          isOpen={analyticsOpen}
          onClose={() => setAnalyticsOpen(false)}
          resumeName={resume.title}
          views={resume.viewCount ?? 0}
        />
      )}
    </>
  );
}
