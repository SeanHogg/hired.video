import { useState, useEffect } from "react";
import { Video, ExternalLink, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UrlPickerInput from "@/components/shared/UrlPickerInput";
import { MediaIconPicker, type PickedMedia } from "@/components/shared/MediaPicker";
import ContentLinkPicker from "@/components/studio/shared/ContentLinkPicker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ResumeSectionMeta, MetaType, Resume } from "@/types/resume";
import { resumeService } from "@/lib/services/resume-service";
import { studioService, StudioProject, StudioProjectStatus } from "@/lib/services/studio-service";
import { useToast } from "@/hooks/use-toast";

interface MetadataModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
  initialMetadata?: ResumeSectionMeta[];
  onSave: (metadata: ResumeSectionMeta[]) => Promise<void>;
}

/** Single source of truth for "is this video URL a WebM or MP4". Used
 *  by both the Studio-project picker and the generic media picker so
 *  the suffix rule can't drift between the two. */
function metaTypeFromVideoUrl(url: string): MetaType {
  return url.toLowerCase().endsWith(".webm") ? MetaType.VideoWebM : MetaType.VideoMP4;
}

/** Resolve the right `MetaType` for an asset coming back from
 *  MediaPicker (Upload / Stock / AI). YouTube isn't reachable from
 *  MediaPicker — that path stays in `pickStudioProject`. */
function metaTypeFromAsset(asset: PickedMedia): MetaType {
  return asset.mediaType === "image" ? MetaType.Image : metaTypeFromVideoUrl(asset.url);
}

/** What kind of inline preview the UrlPickerInput should render for a
 *  given metaType — kept next to the MetaType helpers so the mapping
 *  stays with the rest of the type plumbing. YouTube + Hyperlink return
 *  `undefined` (no inline preview — YouTube needs an iframe and a
 *  plain link can point anywhere). */
function previewKindFromMetaType(t: MetaType): "image" | "video" | undefined {
  if (t === MetaType.Image) return "image";
  if (t === MetaType.VideoMP4 || t === MetaType.VideoWebM) return "video";
  return undefined;
}

export default function MetadataModal({
  open,
  onOpenChange,
  resumeId,
  initialMetadata = [],
  onSave,
}: MetadataModalProps) {
  const { toast } = useToast();
  const [metaData, setMetaData] = useState<ResumeSectionMeta[]>(initialMetadata);
  const [saving, setSaving] = useState(false);
  const [resume, setResume] = useState<Resume | null>(null);
  const [loadingResume, setLoadingResume] = useState(false);

  // Studio picker state
  const [studioPickerOpen, setStudioPickerOpen] = useState(false);
  const [studioPickerTarget, setStudioPickerTarget] = useState<number | null>(null);
  const [studioProjects, setStudioProjects] = useState<StudioProject[]>([]);
  const [loadingStudio, setLoadingStudio] = useState(false);

  const tryUuid = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : `${Math.random().toString(16).slice(2)}-${Date.now()}`;

  useEffect(() => {
    if (open) {
      setMetaData(initialMetadata);
      setResume(null);
    }
  }, [open, initialMetadata]);

  useEffect(() => {
    const fetchResume = async () => {
      if (open && resumeId && !resume) {
        setLoadingResume(true);
        try {
          const resumeData = await resumeService.getResumeById(resumeId);
          setResume(resumeData);
        } catch {
          toast({ title: "Error", description: "Failed to load resume sections.", variant: "destructive" });
        } finally {
          setLoadingResume(false);
        }
      }
    };
    fetchResume();
  }, [open, resumeId, resume, toast]);

  const openStudioPicker = async (index: number) => {
    setStudioPickerTarget(index);
    setStudioPickerOpen(true);
    if (studioProjects.length === 0) {
      setLoadingStudio(true);
      try {
        const res = await studioService.getProjects();
        setStudioProjects(res.data ?? []);
      } catch {
        toast({ title: "Error", description: "Failed to load Studio projects.", variant: "destructive" });
      } finally {
        setLoadingStudio(false);
      }
    }
  };

  const pickStudioProject = (project: StudioProject) => {
    if (studioPickerTarget === null) return;

    const youtubeUrl = project.youtubeVideoId
      ? `https://www.youtube.com/watch?v=${project.youtubeVideoId}`
      : null;
    const url = youtubeUrl ?? project.videoUrl ?? "";
    const metaType = youtubeUrl
      ? MetaType.YouTube
      : metaTypeFromVideoUrl(project.videoUrl ?? "");

    setMetaData((prev) =>
      prev.map((m, i) =>
        i === studioPickerTarget
          ? {
              ...m,
              url,
              metaType,
              name: m.name || project.title,
            }
          : m,
      ),
    );
    setStudioPickerOpen(false);
    setStudioPickerTarget(null);
  };

  const setUrlAndType = (index: number, url: string, metaType: MetaType) => {
    setMetaData((prev) =>
      prev.map((m, i) => (i === index ? { ...m, url, metaType } : m)),
    );
  };

  const pickAsset = (index: number, asset: PickedMedia) =>
    setUrlAndType(index, asset.url, metaTypeFromAsset(asset));

  const pickEntityLink = (index: number, url: string) =>
    setUrlAndType(index, url, MetaType.Hyperlink);

  const addMeta = () => {
    setMetaData((prev) => [
      ...prev,
      {
        id: tryUuid(),
        userId: "",
        referenceId: "",
        name: "",
        metaType: MetaType.Hyperlink,
        url: "",
        description: "",
      },
    ]);
  };

  const updateMeta = (index: number, field: keyof ResumeSectionMeta, value: string | number) => {
    setMetaData((prev) =>
      prev.map((m, i) => (i === index ? ({ ...m, [field]: value } as ResumeSectionMeta) : m)),
    );
  };

  const removeMeta = (index: number) => {
    setMetaData((prev) => prev.filter((_, i) => i !== index));
  };

  const getSectionOptions = () => {
    const options: { value: string; label: string; group: string }[] = [];
    if (!resume?.content) return options;

    if (resume.content.basics?.id)
      options.push({ value: resume.content.basics.id, label: `${resume.content.basics.name || "Profile"} (Basics)`, group: "Profile" });

    resume.content?.work?.forEach((work, i) => {
      if (work.id)
        options.push({ value: work.id, label: `${work.position || `Work ${i + 1}`} at ${work.name || "Company"}`, group: "Work Experience" });
    });
    resume.content?.education?.forEach((edu, i) => {
      if (edu.id)
        options.push({ value: edu.id, label: `${edu.studyType || "Degree"} at ${edu.institution || `Education ${i + 1}`}`, group: "Education" });
    });
    resume.content?.projects?.forEach((project, i) => {
      if (project.id)
        options.push({ value: project.id, label: project.name || `Project ${i + 1}`, group: "Projects" });
    });
    resume.content?.skills?.forEach((skill, i) => {
      if (skill.id)
        options.push({ value: skill.id, label: skill.name || `Skill ${i + 1}`, group: "Skills" });
    });
    resume.content?.volunteer?.forEach((v, i) => {
      if (v.id)
        options.push({ value: v.id, label: `${v.position || "Volunteer"} at ${v.organization || `Organization ${i + 1}`}`, group: "Volunteer" });
    });

    return options;
  };

  const sectionOptions = getSectionOptions();

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(metaData);
      onOpenChange(false);
    } catch {
      toast({ title: "Error", description: "Failed to save resume media.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const publishedProjects = studioProjects.filter(
    (p) => p.status === StudioProjectStatus.Published || p.status === StudioProjectStatus.Completed,
  );
  const otherProjects = studioProjects.filter(
    (p) => p.status !== StudioProjectStatus.Published && p.status !== StudioProjectStatus.Completed,
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-4xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader className="min-w-0">
            <DialogTitle className="text-lg sm:text-xl pr-8">Manage Resume Media</DialogTitle>
            <DialogDescription className="text-sm sm:text-base">
              Add videos, images, and links to enhance your resume sections.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 min-w-0">
            <div className="flex justify-between items-center">
              <Button type="button" variant="outline" size="sm" onClick={addMeta} className="min-h-[44px]">
                Add Media
              </Button>
            </div>

            {metaData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No media added yet. Click "Add Media" to associate links, images, or videos with your resume.
              </p>
            ) : (
              <div className="space-y-4">
                {metaData.map((m, i) => (
                  <div key={m.id} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 border rounded-lg p-3 sm:p-4 min-w-0">
                    <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                      <Label className="text-sm">Label</Label>
                      <Input
                        value={m.name}
                        onChange={(e) => updateMeta(i, "name", e.target.value)}
                        placeholder="e.g., Demo Reel"
                        className="min-h-[44px] w-full"
                      />
                    </div>
                    <div className="min-w-0 sm:col-span-1 lg:col-span-2">
                      <Label className="text-sm">URL</Label>
                      <UrlPickerInput
                        value={m.url}
                        onChange={(url) => updateMeta(i, "url", url)}
                        placeholder="https://..."
                        className="min-h-[44px]"
                        containerClassName="gap-2"
                        previewKind={previewKindFromMetaType(m.metaType)}
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => openStudioPicker(i)}
                          aria-label="Pick from Studio"
                          title="Pick from Studio"
                        >
                          <Video className="h-4 w-4" />
                        </Button>
                        <ContentLinkPicker
                          onSelect={(url) => pickEntityLink(i, url)}
                          label="Link to one of your resumes, profile, companies, or jobs"
                        />
                        <MediaIconPicker
                          accept="image+video"
                          onPick={(_url, asset) => pickAsset(i, asset)}
                          label="Upload, pick stock, or AI-generate an image or video"
                        />
                      </UrlPickerInput>
                    </div>
                    <div className="min-w-0">
                      <Label>Type</Label>
                      <Select value={String(m.metaType)} onValueChange={(val) => updateMeta(i, "metaType", Number(val))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={String(MetaType.Hyperlink)}>Link</SelectItem>
                          <SelectItem value={String(MetaType.Image)}>Image</SelectItem>
                          <SelectItem value={String(MetaType.YouTube)}>YouTube</SelectItem>
                          <SelectItem value={String(MetaType.VideoMP4)}>Video (MP4)</SelectItem>
                          <SelectItem value={String(MetaType.VideoWebM)}>Video (WebM)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-0">
                      <Label>Section</Label>
                      <Select value={m.referenceId || ""} onValueChange={(val) => updateMeta(i, "referenceId", val)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose section" />
                        </SelectTrigger>
                        <SelectContent>
                          {sectionOptions.length === 0 ? (
                            <SelectItem value="none" disabled>
                              {loadingResume ? "Loading sections..." : "No sections available"}
                            </SelectItem>
                          ) : (
                            Object.entries(
                              sectionOptions.reduce(
                                (groups, option) => {
                                  if (!groups[option.group]) groups[option.group] = [];
                                  groups[option.group].push(option);
                                  return groups;
                                },
                                {} as Record<string, typeof sectionOptions>,
                              ),
                            ).map(([group, options]) => (
                              <div key={group}>
                                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{group}</div>
                                {options.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </div>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-6">
                      <Label>Description</Label>
                      <Textarea
                        rows={2}
                        value={m.description || ""}
                        onChange={(e) => updateMeta(i, "description", e.target.value)}
                        placeholder="Optional description for this media item"
                      />
                    </div>
                    <div className="md:col-span-6 flex justify-end">
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeMeta(i)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setMetaData(initialMetadata); onOpenChange(false); }} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Media"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Studio Picker Dialog */}
      <Dialog open={studioPickerOpen} onOpenChange={setStudioPickerOpen}>
        <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pick from Studio</DialogTitle>
            <DialogDescription>
              Select a video from your Studio projects to attach to this resume section.
            </DialogDescription>
          </DialogHeader>

          {loadingStudio ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : studioProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No Studio projects found. Create a video in the Studio first.
            </p>
          ) : (
            <div className="space-y-4">
              {publishedProjects.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Published</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {publishedProjects.map((project) => (
                      <StudioProjectCard key={project.id} project={project} onSelect={pickStudioProject} />
                    ))}
                  </div>
                </div>
              )}
              {otherProjects.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Other Projects</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {otherProjects.map((project) => (
                      <StudioProjectCard key={project.id} project={project} onSelect={pickStudioProject} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StudioProjectCard({
  project,
  onSelect,
}: {
  project: StudioProject;
  onSelect: (project: StudioProject) => void;
}) {
  const hasVideo = project.youtubeVideoId || project.videoUrl;
  const statusColor =
    project.status === StudioProjectStatus.Published || project.status === StudioProjectStatus.Completed
      ? "bg-green-100 text-green-800"
      : project.status === StudioProjectStatus.Processing || project.status === StudioProjectStatus.Publishing
        ? "bg-accent text-accent-foreground"
        : "bg-muted text-foreground/80";

  return (
    <button
      type="button"
      onClick={() => onSelect(project)}
      disabled={!hasVideo}
      className="flex items-start gap-3 border rounded-lg p-3 text-left hover:border-primary hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
    >
      {/* Thumbnail */}
      <div className="w-16 h-12 rounded bg-muted shrink-0 overflow-hidden flex items-center justify-center">
        {project.thumbnailUrl ? (
          <img src={project.thumbnailUrl} alt={project.title} className="w-full h-full object-cover" />
        ) : (
          <Play className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{project.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="secondary" className={`text-xs ${statusColor}`}>
            {project.status}
          </Badge>
          {project.youtubeVideoId && (
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
        {!hasVideo && (
          <p className="text-xs text-muted-foreground mt-1">No video URL yet</p>
        )}
      </div>
    </button>
  );
}
