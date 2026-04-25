import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  Edit,
  Eye,
  FileJson,
  FileText,
  FileType,
  Globe,
  Lock,
  Monitor,
  Printer,
  RotateCcw,
  Share2,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Target,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import AuthOverlay from "@/components/AuthOverlay";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import Footer from "@/components/Footer";
import MetadataModal from "@/components/MetadataModal";
import Navigation from "@/components/Navigation";
import { ResumeActionsMenu } from "@/components/ResumeActionsMenu";
import { ToolDialog } from "@/components/ToolDialog";
import { ToolHistorySheet } from "@/components/ToolHistorySheet";
import { EmbedSheet } from "@/components/EmbedSheet";
import RenameResumeDialog from "@/components/RenameResumeDialog";
import QRCodeDialog from "@/components/QRCodeDialog";
import ShareModal from "@/components/ShareModal";
import ResumeAnalyticsDialog from "@/components/ResumeAnalyticsDialog";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";
import { downloadResume } from "@/lib/resume-download";
import { SAMPLE_RESUME } from "@/lib/sample-resume";
import { useSEO } from "@/lib/seo";
import { resumeService, type ResumeSummary } from "@/lib/services/resume-service";
import { studioService, type ResumeVideo } from "@/lib/services/studio-service";
import { isTemplateUnlocked } from "@/lib/template-unlocks";
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

function youTubeEmbed(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
  } catch {}
  return url;
}

function VideoSlot({ items }: { items: ResumeSectionMeta[] }) {
  const [idx, setIdx] = useState(0);
  if (items.length === 0) return null;
  const current = items[idx];
  return (
    <Card className="bg-white/10 border-white/30 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="aspect-video bg-black rounded-lg relative overflow-hidden">
          {items.length > 1 && (
            <>
              <button type="button" aria-label="Previous" className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/40 hover:bg-black/60 text-white rounded-full p-2" onClick={() => setIdx((p) => (p - 1 + items.length) % items.length)}>
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button type="button" aria-label="Next" className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/40 hover:bg-black/60 text-white rounded-full p-2" onClick={() => setIdx((p) => (p + 1) % items.length)}>
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
          {current.metaType === MetaType.YouTube ? (
            <iframe className="absolute inset-0 w-full h-full" src={youTubeEmbed(current.url)} title={current.name || "Video Resume"} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          ) : (
            <video className="absolute inset-0 w-full h-full" controls>
              <source src={current.url} type={current.metaType === MetaType.VideoWebM ? "video/webm" : "video/mp4"} />
            </video>
          )}
        </div>
        <div className="mt-4 text-xs opacity-80 text-center">Video {idx + 1} / {items.length}</div>
      </CardContent>
    </Card>
  );
}

// Mounted only on /resumes/sample so useSEO doesn't fire on owned-resume
// pages where we currently leave SEO at app defaults. Keeps the title/meta
// tags in sync with whichever ?template= preset is being previewed.
function SampleTemplateSEO({ descriptor }: { descriptor: ResumeTemplateDescriptor }) {
  useSEO("/resumes/sample", {
    title: `${descriptor.name} — Resume Template — hired.video Marketplace`,
    description:
      `Preview the "${descriptor.name}" resume template — a professionally designed, ` +
      `ATS-friendly layout from the hired.video Marketplace. Buy once, apply to any of your resumes.`,
    keywords: `resume templates, ${descriptor.name} resume template, ${descriptor.industry ?? ""}, professional resume design, ATS-friendly resume, hired.video marketplace`,
    ogTitle: `${descriptor.name} Resume Template — hired.video`,
    ogDescription:
      `${descriptor.industry ? descriptor.industry + " — " : ""}professionally designed resume template. ` +
      `Preview, purchase, and apply to your resume in one click.`,
  });
  return null;
}

export default function ResumeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const printMode = searchParams.get("print") === "1";
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { isAuthenticated, user } = useAuth();
  const { addItem, openCart } = useCart();
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
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorText, setEditorText] = useState<string>(() => JSON.stringify(DEFAULT_DESCRIPTOR, null, 2));
  const [editorError, setEditorError] = useState<string | null>(null);

  // Run-Tool dialog state — opened from this resume's "..." menu or the
  // history sheet's "Run again" action.
  const [toolDialog, setToolDialog] = useState<{ open: boolean; toolId: string | null }>({ open: false, toolId: null });
  // Tool-history side panel — opened from the "..." menu.
  const [toolHistoryOpen, setToolHistoryOpen] = useState(false);
  // Embed side panel — opened from the "..." menu's Embed item.
  const [embedOpen, setEmbedOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  // Sample-mode marketplace state — purchase/cart, the user's own resumes the
  // selected template can be previewed against, and which one is in view.
  // "sample" means render the SAMPLE_RESUME fixture; otherwise an owned id.
  const [unlocked, setUnlocked] = useState(false);
  const [userResumes, setUserResumes] = useState<ResumeSummary[]>([]);
  const [sampleSelection, setSampleSelection] = useState<string>("sample");

  const videoItems = useMemo<ResumeSectionMeta[]>(() => {
    const videoTypes = new Set<MetaType>([MetaType.YouTube, MetaType.VideoMP4, MetaType.VideoWebM]);
    const fromMeta = resume?.content?.metaData?.filter((m) => videoTypes.has(m.metaType)) ?? [];
    const fromStudio: ResumeSectionMeta[] = studioVideos.map((v) => ({
      id: v.id,
      userId: "",
      referenceId: id ?? "",
      name: v.title || "Studio Video Resume",
      url: v.youtubeUrl ?? v.videoUrl ?? "",
      metaType: v.youtubeUrl ? MetaType.YouTube : MetaType.VideoMP4,
    }));
    return [...fromMeta, ...fromStudio];
  }, [resume, studioVideos, id]);

  // Pick initial template: URL ?template= wins (preview), otherwise the resume's
  // saved default (resume.content.meta.template), otherwise DEFAULT_DESCRIPTOR.
  const pickInitialDescriptor = (loaded: Resume | null): ResumeTemplateDescriptor => {
    const requested = searchParams.get("template");
    const urlMatch = getTemplateById(requested);
    if (urlMatch) return urlMatch;
    const saved = getTemplateById(loaded?.content?.meta?.template);
    if (saved) return saved;
    return DEFAULT_DESCRIPTOR;
  };

  useEffect(() => {
    if (!id) return;
    // Sample mode — /resumes/sample is the marketplace template preview.
    // Descriptor follows ?template=<id>; the rendered resume is driven by
    // `sampleSelection` (set in a separate effect once the user's resumes
    // load), so changing ?template= here doesn't clobber that selection.
    if (id === "sample") {
      setStudioVideos([]);
      const initial = pickInitialDescriptor(SAMPLE_RESUME);
      setDescriptor(initial);
      setEditorText(JSON.stringify(initial, null, 2));
      setLoading(false);
      return;
    }

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

  // Sample-mode: track unlock status for the currently-previewed template so
  // the Add-to-Cart button can flip to "Already purchased" without a refresh
  // (the cart drawer fires `hired:template-unlocked` after checkout).
  useEffect(() => {
    setUnlocked(isTemplateUnlocked(descriptor.id));
    const handler = () => setUnlocked(isTemplateUnlocked(descriptor.id));
    window.addEventListener("hired:template-unlocked", handler);
    return () => window.removeEventListener("hired:template-unlocked", handler);
  }, [descriptor.id]);

  // Sample-mode: when an authenticated visitor lands on the template preview,
  // fetch their resumes so they can render the template against their own
  // content. First load defaults the selection to the master resume; explicit
  // user picks (including "sample") aren't overridden by re-fetches.
  useEffect(() => {
    if (id !== "sample" || !isAuthenticated) {
      setUserResumes([]);
      return;
    }
    let cancelled = false;
    resumeService
      .getUserResumes()
      .then((rs) => {
        if (cancelled) return;
        setUserResumes(rs ?? []);
        const master = (rs ?? []).find((r: any) => r.isMaster === true || r.IsMaster === true);
        const def = master ?? (rs ?? [])[0];
        if (!def) return;
        const defId: string = (def as any).id ?? (def as any).Id;
        setSampleSelection((curr) => (curr === "sample" ? defId : curr));
      })
      .catch(() => {
        if (!cancelled) setUserResumes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isAuthenticated]);

  // Sample-mode: load the resume currently selected for preview. Falls back
  // to SAMPLE_RESUME if the fetch fails so the page never goes blank.
  useEffect(() => {
    if (id !== "sample") return;
    if (sampleSelection === "sample") {
      setResume(SAMPLE_RESUME);
      return;
    }
    let cancelled = false;
    resumeService
      .getResumeById(sampleSelection)
      .then((r) => {
        if (!cancelled && r) setResume(r);
      })
      .catch(() => {
        if (!cancelled) setResume(SAMPLE_RESUME);
      });
    return () => {
      cancelled = true;
    };
  }, [id, sampleSelection]);

  const applyPreset = (preset: ResumeTemplateDescriptor) => {
    setDescriptor(preset);
    setEditorText(JSON.stringify(preset, null, 2));
    setEditorError(null);
  };

  const applyEditor = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(editorText);
    } catch (e) {
      setEditorError(`JSON parse error: ${(e as Error).message}`);
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
      : { ...result.value, id: "custom", name: "Custom" };
    setDescriptor(next);
    setEditorText(JSON.stringify(next, null, 2));
    setEditorError(null);
  };

  // Print mode — bare resume, no chrome, auto-prints for PDF export.
  useEffect(() => {
    if (printMode && id) {
      try {
        const stashed = sessionStorage.getItem(`resume-descriptor:${id}`);
        if (stashed) setDescriptor(JSON.parse(stashed));
      } catch {}
    }
  }, [printMode, id]);

  useEffect(() => {
    if (printMode && resume && !loading) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [printMode, resume, loading]);

  if (printMode) {
    if (loading || !resume) {
      return <div className="p-8 text-center text-muted-foreground">Preparing resume for print…</div>;
    }
    return (
      <div className="print:bg-white">
        <style>{`
          @media print {
            @page { margin: 0.5in; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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

  // Sample-mode marketplace helpers — pricing, cart wiring, the apply-to-my-
  // resume target, and the resume-selector label/options.
  const priceLabel = (cents?: number) =>
    !cents || cents <= 0 ? "Free" : `$${(cents / 100).toFixed(2)}`;
  const handleAddToCart = () => {
    addItem({
      id: `template:${descriptor.id}`,
      name: descriptor.name,
      price: (descriptor.priceCents ?? 0) / 100,
      type: "template",
    });
    openCart();
  };
  const masterResumeSummary = userResumes.find(
    (r: any) => r.isMaster === true || r.IsMaster === true,
  ) as any | undefined;
  const masterResumeId: string | null =
    masterResumeSummary?.id ?? masterResumeSummary?.Id ?? null;
  const applyHref = masterResumeId
    ? `/resumes/${masterResumeId}?template=${descriptor.id}`
    : "/resumes";
  const sampleSelectionLabel = (() => {
    if (sampleSelection === "sample") return "Sample resume";
    const match = userResumes.find(
      (r: any) => (r.id ?? r.Id) === sampleSelection,
    ) as any | undefined;
    return match?.title || match?.Title || "Your resume";
  })();

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
      if (!okResp) throw new Error("Server rejected privacy change");
      await refreshResume();
      toast({ title: "Privacy updated", description: `Visibility set to ${privacy.replace("_", " ")}.` });
    } catch (e) {
      toast({ title: "Failed to update privacy", description: (e as Error)?.message || "Please try again.", variant: "destructive" });
    }
  };

  const handlePromoteToMaster = async () => {
    if (!resume?.id) return;
    try {
      const okResp = await resumeService.promoteVariantToMaster(resume.id);
      if (okResp) {
        toast({ title: "Promoted", description: "Variant promoted to master." });
        await refreshResume();
      } else {
        toast({ title: "Promote failed", description: "Could not promote variant to master.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Promote failed", description: (e as Error)?.message ?? "Unexpected error", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!resume?.id) return;
    try {
      await resumeService.deleteResume(resume.id);
      toast({ title: "Deleted", description: "Resume deleted successfully." });
      navigate("/resumes");
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error)?.message || "Please try again.", variant: "destructive" });
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
    const nextData = {
      ...resume.content,
      Meta: { ...(resume.content?.meta ?? {}), [slot]: descriptor.id },
    };
    try {
      const updated = await resumeService.updateResumeData(resume.id, { data: nextData });
      setResume(updated);
      toast({
        title: "Template assigned",
        description: slot === "template"
          ? `"${descriptor.name}" is now the default view for this resume.`
          : `"${descriptor.name}" is now the embedded view for this resume.`,
      });
    } catch (e) {
      toast({ title: "Could not save template", description: (e as Error)?.message || "Please try again.", variant: "destructive" });
    }
  };

  const assignedDefaultId = resume?.content?.meta?.template ?? null;
  const assignedEmbeddedId = resume?.content?.meta?.embeddedTemplate ?? null;

  const privacyIcon = (p?: string) => {
    switch (p) {
      case "public": return <Globe className="w-3 h-3" />;
      case "recruiter_only":
      case "connections": return <Users className="w-3 h-3" />;
      default: return <Lock className="w-3 h-3" />;
    }
  };
  const privacyLabel = (p?: string) => {
    switch (p) {
      case "public": return "Public";
      case "recruiter_only": return "Recruiter Only";
      case "connections": return "Connections";
      default: return "Private";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />

        <div className={`pt-16 ${!isAuthenticated && !isSample ? "relative" : ""}`}>
          {isSample && <SampleTemplateSEO descriptor={descriptor} />}
          {!isAuthenticated && !isSample && <AuthOverlay contentType="resume" title={resume?.content?.basics?.name || resume?.title || "Resume"} />}

          <div className="bg-muted/30 border-b">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  <span className="font-mono">{descriptor.name}</span>
                </Badge>
                {!isSample && resume?.isActive && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800 flex items-center gap-1">
                    <Target className="w-3 h-3" />Active
                  </Badge>
                )}
                {!isSample && resume?.isMaster && (
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 flex items-center gap-1">
                    <Star className="w-3 h-3" />Master
                  </Badge>
                )}
                {!isSample && resume && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    {privacyIcon(resume.privacy)}
                    {privacyLabel(resume.privacy)}
                  </Badge>
                )}
                {!isSample && isOwner && resume && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => navigate(`/resumes/edit/${resume.id}`)}
                    aria-label="Edit Resume"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isSample ? (
                  // Marketplace template preview — pick which resume to render
                  // the template against. Defaults to the visitor's master
                  // resume when authenticated, falls back to SAMPLE_RESUME.
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        <FileText className="w-4 h-4 mr-1" />
                        <span className="max-w-[160px] truncate">{sampleSelectionLabel}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                        Render this template using
                      </DropdownMenuLabel>
                      {isAuthenticated && userResumes.length > 0 && userResumes.map((r: any) => {
                        const rid: string = r.id ?? r.Id;
                        const title: string = r.title ?? r.Title ?? "Untitled";
                        const isMaster = r.isMaster === true || r.IsMaster === true;
                        return (
                          <DropdownMenuItem
                            key={rid}
                            onClick={() => setSampleSelection(rid)}
                            className={sampleSelection === rid ? "bg-accent" : ""}
                          >
                            <div className="flex flex-col flex-1 min-w-0">
                              <span className="font-medium truncate">{title}</span>
                              {isMaster && (
                                <span className="text-xs text-muted-foreground">Master resume</span>
                              )}
                            </div>
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuItem
                        onClick={() => setSampleSelection("sample")}
                        className={sampleSelection === "sample" ? "bg-accent" : ""}
                      >
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="font-medium truncate">Sample resume</span>
                          <span className="text-xs text-muted-foreground">Showcase data</span>
                        </div>
                      </DropdownMenuItem>
                      {!isAuthenticated && (
                        <>
                          <DropdownMenuSeparator />
                          <div className="px-2 py-2 text-xs text-muted-foreground">
                            <Link to="/login" className="underline hover:text-foreground">Sign in</Link>{" "}
                            to render this template using your own resume.
                          </div>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        <FileType className="w-4 h-4 mr-1" />
                        Template
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                        Your templates
                      </DropdownMenuLabel>
                      {TEMPLATE_PRESETS
                        // Show only the free default + templates this user has
                        // unlocked. Browsing/previewing other templates happens
                        // in the marketplace, not here — the dropdown is for
                        // applying templates the user can actually use.
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
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="font-medium truncate">{preset.name}</span>
                                <span className="text-xs text-muted-foreground flex items-center gap-2">
                                  {preset.industry}
                                  {isAssignedDefault && <span className="text-primary">· default</span>}
                                  {isAssignedEmbedded && <span className="text-primary">· embedded</span>}
                                </span>
                              </div>
                            </DropdownMenuItem>
                          );
                        })}
                      {isOwner && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                            Assign "{descriptor.name}"
                          </DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => saveTemplateAssignment("template")}
                            disabled={assignedDefaultId === descriptor.id || descriptor.id === "custom"}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Set as default view
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => saveTemplateAssignment("embeddedTemplate")}
                            disabled={assignedEmbeddedId === descriptor.id || descriptor.id === "custom"}
                          >
                            <Monitor className="w-4 h-4 mr-2" />
                            Set as embedded view
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setEditorOpen((v) => !v)}>
                        <Code2 className="w-4 h-4 mr-2" />
                        {editorOpen ? "Hide template design editor" : "Edit the Template Design"}
                      </DropdownMenuItem>
                      <div className="p-1 pt-2">
                        <Button asChild size="sm" className="w-full">
                          <Link to="/search?category=templates">
                            <Store className="w-4 h-4 mr-1" />
                            Browse Marketplace
                          </Link>
                        </Button>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {isSample ? (
                  unlocked ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to={applyHref}>
                        <Check className="w-4 h-4 mr-1" />
                        {masterResumeId ? "Use on my resume" : "Already purchased"}
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handleAddToCart}>
                      <ShoppingCart className="w-4 h-4 mr-1" />
                      Add to Cart — {priceLabel(descriptor.priceCents)}
                    </Button>
                  )
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        <Download className="w-4 h-4 mr-1" />
                        Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handlePdf} disabled={!resume}>
                        <Printer className="w-4 h-4 mr-2" />PDF (via browser print)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownloadFormat("word")} disabled={!resume}>
                        <FileType className="w-4 h-4 mr-2" />Word (.doc)
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDownloadFormat("text")} disabled={!resume}>
                        <FileText className="w-4 h-4 mr-2" />Plain Text (.txt)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownloadFormat("json")} disabled={!resume}>
                        <FileJson className="w-4 h-4 mr-2" />Raw JSON (.json)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {resume && !isSample && (
                  <ResumeActionsMenu
                    isOwner={isOwner}
                    isActive={resume.isActive}
                    isMaster={resume.isMaster}
                    parentId={resume.parentId}
                    onEdit={() => navigate(`/resumes/edit/${resume.id}`)}
                    onRename={isOwner ? () => setRenameOpen(true) : undefined}
                    onAddMedia={() => setMetadataModal({ open: true, initialMetadata: resume.content.metaData || [] })}
                    onShare={() => setShareOpen(true)}
                    onCopyLink={async () => {
                      try {
                        await navigator.clipboard.writeText(window.location.href);
                        toast({ title: "Link copied", description: window.location.href });
                      } catch {
                        toast({ title: "Could not copy", description: "Clipboard access denied.", variant: "destructive" });
                      }
                    }}
                    onShowQR={() => setQrOpen(true)}
                    onEmbed={() => setEmbedOpen(true)}
                    onDownload={handleDownloadFormat}
                    onChangePrivacy={handleChangePrivacy}
                    onPromoteToMaster={handlePromoteToMaster}
                    onDelete={handleDelete}
                    onRunTool={(toolId) => setToolDialog({ open: true, toolId })}
                    onViewToolHistory={() => setToolHistoryOpen(true)}
                    onViewAnalytics={isOwner ? () => setAnalyticsOpen(true) : undefined}
                    triggerVariant="outline"
                  />
                )}
              </div>
            </div>
          </div>

          {loading && (
            <div className="max-w-6xl mx-auto px-6 py-12">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-muted rounded w-1/3" />
                <div className="h-48 bg-muted rounded" />
                <div className="h-4 bg-muted rounded w-3/4" />
              </div>
            </div>
          )}

          {!loading && !resume && isPrivate && (
            <div className="max-w-xl mx-auto px-6 py-16 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-muted-foreground" />
              </div>
              <h1 className="text-2xl font-bold mb-3">This resume is private</h1>
              <p className="text-muted-foreground mb-6">
                The owner hasn't made this resume public. Ask them to change its visibility or share it with you directly.
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(window.location.href)}>
                  <Share2 className="w-4 h-4 mr-1" />Copy link to send owner
                </Button>
                <Button onClick={() => navigate("/resumes")}>Back to Resumes</Button>
              </div>
            </div>
          )}

          {!loading && !resume && !isPrivate && (
            <div className="max-w-6xl mx-auto px-6 py-12 text-center">
              <h1 className="text-2xl font-bold mb-4">Resume Not Found</h1>
              <p className="text-muted-foreground mb-6">Could not load resume <code>{id}</code>.</p>
              <Button onClick={() => navigate("/resumes")}><ArrowLeft className="w-4 h-4 mr-2" />Back to Resumes</Button>
            </div>
          )}

          {resume && (
            <div className="flex">
              <div className="flex-1 min-w-0">
                <DeclarativeResumeRenderer
                  resume={resume}
                  descriptor={descriptor}
                  videoSlot={descriptor.hero.showVideo ? <VideoSlot items={videoItems} /> : null}
                  isOwner={isOwner}
                  onEditSection={(key) =>
                    navigate(`/resumes/edit/${resume.id}?section=${encodeURIComponent(key)}`)
                  }
                />
              </div>

              {isSample && (
                <aside className="hidden lg:block w-[320px] shrink-0 border-l bg-card sticky top-16 self-start max-h-[calc(100vh-4rem)] overflow-auto">
                  <div className="p-5 space-y-4">
                    <div className="rounded-xl border bg-gradient-to-br from-brand-purple/10 to-brand-blue/10 p-5 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-purple">
                        <Sparkles className="w-4 h-4" />
                        Earn 95% on every sale
                      </div>
                      <h3 className="text-lg font-bold leading-tight">
                        Design resume templates. Get paid.
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Designers and recruiters keep 95% of every template sale on the
                        hired.video Marketplace. Your designs reach job seekers worldwide.
                      </p>
                      <Button asChild size="sm" className="w-full">
                        <Link to="/creators">
                          <Store className="w-4 h-4 mr-1" />
                          Become a Creator
                        </Link>
                      </Button>
                    </div>

                    <div className="rounded-xl border p-4 space-y-2">
                      <h4 className="text-sm font-semibold">Like this template?</h4>
                      <p className="text-xs text-muted-foreground">
                        Add it to your library and apply it to any of your resumes — the
                        same content, instantly restyled.
                      </p>
                      {unlocked ? (
                        <Button asChild size="sm" variant="outline" className="w-full">
                          <Link to={applyHref}>
                            <Check className="w-4 h-4 mr-1" />
                            {masterResumeId ? "Use on my resume" : "Already purchased"}
                          </Link>
                        </Button>
                      ) : (
                        <Button size="sm" className="w-full" onClick={handleAddToCart}>
                          <ShoppingCart className="w-4 h-4 mr-1" />
                          Add to Cart — {priceLabel(descriptor.priceCents)}
                        </Button>
                      )}
                      <Button asChild size="sm" variant="ghost" className="w-full">
                        <Link to="/search?category=templates">
                          Browse all templates
                        </Link>
                      </Button>
                    </div>
                  </div>
                </aside>
              )}

              {editorOpen && (
                <aside className="w-[420px] shrink-0 border-l bg-card sticky top-16 self-start max-h-[calc(100vh-4rem)] overflow-auto">
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Template Design</h3>
                      <Button size="sm" variant="ghost" onClick={() => applyPreset(DEFAULT_DESCRIPTOR)}>
                        <RotateCcw className="w-4 h-4 mr-1" />Reset
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
                    <Button size="sm" className="w-full" onClick={applyEditor}>Apply</Button>
                    <p className="text-xs text-muted-foreground">
                      Edits are validated and shown as a "Custom" design. Previewing only — custom designs can't yet be saved as the default or embedded view.
                    </p>
                  </div>
                </aside>
              )}
            </div>
          )}

          <Footer />
        </div>
      </div>

      {resume && !isSample && (
        <MetadataModal
          open={metadataModal.open}
          onOpenChange={(open) => setMetadataModal((prev) => ({ ...prev, open }))}
          resumeId={resume.id}
          initialMetadata={metadataModal.initialMetadata}
          onSave={handleSaveMetadata}
        />
      )}

      {resume && !isSample && (
        <ToolDialog
          open={toolDialog.open}
          onOpenChange={(open) => setToolDialog((prev) => ({ ...prev, open }))}
          toolId={toolDialog.toolId}
          anchor={{ type: "resume", id: resume.id, name: resume.title }}
        />
      )}

      {resume && !isSample && isOwner && (
        <ToolHistorySheet
          open={toolHistoryOpen}
          onOpenChange={setToolHistoryOpen}
          source={{ kind: "entity", entityType: "resume", entityId: resume.id }}
          entityName={resume.title}
          onRunTool={(toolId) => setToolDialog({ open: true, toolId })}
        />
      )}

      {resume && !isSample && (
        <EmbedSheet
          open={embedOpen}
          onOpenChange={setEmbedOpen}
          resumeId={resume.id}
          resumeName={resume.title}
        />
      )}

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
          title={`QR Code — ${resume.title}`}
          filename={`resume-${resume.id}-qr`}
        />
      )}

      {resume && (
        <ShareModal
          open={shareOpen}
          onOpenChange={setShareOpen}
          shareUrl={window.location.href}
          title={`Share "${resume.title}"`}
          message="Post your resume to your network — link previews use your name and headline."
          shareText={`${resume.title} — my video resume on hired.video`}
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
    </div>
  );
}
