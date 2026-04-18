import { ArrowLeft, ChevronLeft, ChevronRight, Code2, Download, Edit, Eye, FileJson, FileText, FileType, Globe, Lock, Printer, RotateCcw, Star, Target, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import AuthOverlay from "@/components/AuthOverlay";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import Footer from "@/components/Footer";
import MetadataModal from "@/components/MetadataModal";
import Navigation from "@/components/Navigation";
import { ResumeActionsMenu } from "@/components/ResumeActionsMenu";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { exportResumeJson, exportResumePdf, exportResumeText, exportResumeWord } from "@/lib/resume-exporters";
import { SAMPLE_RESUME } from "@/lib/sample-resume";
import { resumeService } from "@/lib/services/resume-service";
import { studioService, type ResumeVideo } from "@/lib/services/studio-service";
import type { Resume, ResumePrivacy, ResumeSectionMeta } from "@/types/resume";
import { MetaType } from "@/types/resume";
import { DEFAULT_DESCRIPTOR, TEMPLATE_PRESETS, type ResumeTemplateDescriptor } from "@/types/resume-template";

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

export default function ResumeViewerPreview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const printMode = searchParams.get("print") === "1";
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();

  const [resume, setResume] = useState<Resume | null>(null);
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

  const videoItems = useMemo<ResumeSectionMeta[]>(() => {
    const videoTypes = new Set([MetaType.YouTube, MetaType.VideoMP4, MetaType.VideoWebM]);
    const fromMeta = resume?.metaData?.filter((m) => videoTypes.has(m.metaType)) ?? [];
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

  useEffect(() => {
    if (!id) return;
    // Sample mode — /resumes/VIEWER/sample renders the showcase resume with
    // whichever preset is requested via ?template=<id>. Skips API calls so
    // anonymous users can browse templates from the home gallery.
    if (id === "sample") {
      setResume(SAMPLE_RESUME);
      setStudioVideos([]);
      const requested = searchParams.get("template");
      const match = TEMPLATE_PRESETS.find((t) => t.id === requested);
      if (match) {
        setDescriptor(match);
        setEditorText(JSON.stringify(match, null, 2));
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const r = await resumeService.getResumeById(id);
        setResume(r);
      } catch {
        try {
          setResume(await resumeService.getResumeForEmbed(id));
        } catch {
          try {
            setResume(await resumeService.getPublicResume(id));
          } catch {
            setResume(null);
          }
        }
      } finally {
        setLoading(false);
      }
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
    try {
      const parsed = JSON.parse(editorText) as ResumeTemplateDescriptor;
      setDescriptor(parsed);
      setEditorError(null);
    } catch (e) {
      setEditorError((e as Error).message);
    }
  };

  // When launched with ?print=1 the window auto-opens the browser print dialog
  // once the resume finishes loading — user then saves as PDF.
  // Descriptor is passed via sessionStorage (keyed on resume id) because URL
  // query params can't reliably carry arbitrary JSON.
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

  // Bare print layout: no chrome, no toolbar — just the rendered resume so the
  // browser's print-to-PDF produces a clean document.
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

  const handlePdf = () => {
    if (!id) return;
    try {
      sessionStorage.setItem(`resume-descriptor:${id}`, JSON.stringify(descriptor));
    } catch {}
    exportResumePdf(`/resumes/VIEWER/${id}?print=1`);
  };

  const isOwner = !!user && !!resume && user.id === resume.userId;

  const refreshResume = async () => {
    if (!resume?.id) return;
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
          {!isAuthenticated && <AuthOverlay contentType="resume" title={resume?.data?.Basics?.Name || resume?.name || "Resume"} />}

          <div className="bg-muted/30 border-b">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="ghost" size="sm" onClick={() => navigate(`/resumes/${id}`)}>
                  <ArrowLeft className="w-4 h-4 mr-2" />Back to Resume
                </Button>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  Preview · <span className="font-mono">{descriptor.name}</span>
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
                {resume && (
                  <ResumeActionsMenu
                    isOwner={isOwner}
                    isActive={resume.isActive}
                    isMaster={resume.isMaster}
                    parentId={resume.parentId}
                    onEdit={() => navigate(`/resumes/edit/${resume.id}`)}
                    onAddMedia={() => setMetadataModal({ open: true, initialMetadata: resume.metaData || [] })}
                    onShare={() => (navigator.share?.({ title: resume.name, url: window.location.href }) ?? navigator.clipboard.writeText(window.location.href))}
                    onDownload={handlePdf}
                    onChangePrivacy={handleChangePrivacy}
                    onPromoteToMaster={handlePromoteToMaster}
                    onDelete={handleDelete}
                    triggerVariant="outline"
                    triggerClassName="h-7 px-2"
                  />
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
                  <DropdownMenuContent align="end" className="w-64">
                    {TEMPLATE_PRESETS.map((preset) => (
                      <DropdownMenuItem
                        key={preset.id}
                        onClick={() => applyPreset(preset)}
                        className={descriptor.id === preset.id ? "bg-accent" : ""}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{preset.name}</span>
                          {preset.industry && <span className="text-xs text-muted-foreground">{preset.industry}</span>}
                        </div>
                      </DropdownMenuItem>
                    ))}
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
                    <DropdownMenuItem onClick={() => resume && exportResumeWord(resume)} disabled={!resume}>
                      <FileType className="w-4 h-4 mr-2" />Word (.doc)
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => resume && exportResumeText(resume)} disabled={!resume}>
                      <FileText className="w-4 h-4 mr-2" />Plain Text (.txt)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => resume && exportResumeJson(resume)} disabled={!resume}>
                      <FileJson className="w-4 h-4 mr-2" />Raw JSON (.json)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button size="sm" variant="outline" onClick={() => setEditorOpen((v) => !v)}>
                  <Code2 className="w-4 h-4 mr-1" />
                  {editorOpen ? "Hide JSON" : "Edit JSON"}
                </Button>
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

          {!loading && !resume && (
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
                />
              </div>

              {editorOpen && (
                <aside className="w-[420px] shrink-0 border-l bg-card sticky top-16 self-start max-h-[calc(100vh-4rem)] overflow-auto">
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Descriptor JSON</h3>
                      <Button size="sm" variant="ghost" onClick={() => applyPreset(DEFAULT_DESCRIPTOR)}>
                        <RotateCcw className="w-4 h-4 mr-1" />Reset
                      </Button>
                    </div>
                    <textarea
                      className="w-full h-[60vh] font-mono text-xs p-3 border rounded bg-background"
                      value={editorText}
                      onChange={(e) => setEditorText(e.target.value)}
                    />
                    {editorError && <div className="text-sm text-destructive">{editorError}</div>}
                    <Button size="sm" className="w-full" onClick={applyEditor}>Apply</Button>
                    <p className="text-xs text-muted-foreground">
                      Edits are local to this preview — nothing is saved. Marketplace publish wires in later.
                    </p>
                  </div>
                </aside>
              )}
            </div>
          )}

          <Footer />
        </div>
      </div>

      {resume && (
        <MetadataModal
          open={metadataModal.open}
          onOpenChange={(open) => setMetadataModal((prev) => ({ ...prev, open }))}
          resumeId={resume.id}
          initialMetadata={metadataModal.initialMetadata}
          onSave={handleSaveMetadata}
        />
      )}
    </div>
  );
}
