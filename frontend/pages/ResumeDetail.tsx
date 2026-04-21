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
  Globe,
  Lock,
  Monitor,
  Printer,
  RotateCcw,
  Share2,
  Star,
  Target,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { downloadResume } from "@/lib/resume-download";
import { SAMPLE_RESUME } from "@/lib/sample-resume";
import { resumeService } from "@/lib/services/resume-service";
import { studioService, type ResumeVideo } from "@/lib/services/studio-service";
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

export default function ResumeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const printMode = searchParams.get("print") === "1";
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
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
  const [qrOpen, setQrOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

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
    // Sample mode — /resumes/sample renders the showcase resume with whichever
    // preset is requested via ?template=<id>. Skips API calls so anonymous
    // users can browse templates from the home gallery.
    if (id === "sample") {
      setResume(SAMPLE_RESUME);
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

        <div className={`pt-16 ${!isAuthenticated ? "relative" : ""}`}>
          {!isAuthenticated && <AuthOverlay contentType="resume" title={resume?.content?.basics?.name || resume?.title || "Resume"} />}

          <div className="bg-muted/30 border-b">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  <span className="font-mono">{descriptor.name}</span>
                </Badge>
                {resume?.isActive && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800 flex items-center gap-1">
                    <Target className="w-3 h-3" />Active
                  </Badge>
                )}
                {resume?.isMaster && (
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 flex items-center gap-1">
                    <Star className="w-3 h-3" />Master
                  </Badge>
                )}
                {resume && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    {privacyIcon(resume.privacy)}
                    {privacyLabel(resume.privacy)}
                  </Badge>
                )}
                {isOwner && resume && (
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <FileType className="w-4 h-4 mr-1" />
                      Template
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                      Preview a template
                    </DropdownMenuLabel>
                    {TEMPLATE_PRESETS.map((preset) => {
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
                    {isOwner && !isSample && (
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
                  </DropdownMenuContent>
                </DropdownMenu>

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

                {resume && !isSample && (
                  <ResumeActionsMenu
                    isOwner={isOwner}
                    isActive={resume.isActive}
                    isMaster={resume.isMaster}
                    parentId={resume.parentId}
                    onEdit={() => navigate(`/resumes/edit/${resume.id}`)}
                    onRename={isOwner ? () => setRenameOpen(true) : undefined}
                    onAddMedia={() => setMetadataModal({ open: true, initialMetadata: resume.content.metaData || [] })}
                    onShare={() => (navigator.share?.({ title: resume.title, url: window.location.href }) ?? navigator.clipboard.writeText(window.location.href))}
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
