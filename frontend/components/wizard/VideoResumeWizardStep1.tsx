import { useCallback, useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ProfileAvatarEditor from "@/components/ProfileAvatarEditor";
import ResumeEmptyDropzone from "@/components/ResumeEmptyDropzone";
import ResumeUploadSheet from "@/components/ResumeUploadSheet";
import { resumeService } from "@/lib/services/resume-service";
import { useAuth } from "@/lib/auth";
import type { Resume, ResumeUploadResponse } from "@/types/resume";

interface VideoResumeWizardStep1Props {
  /** Notifies the parent of the user's current selection so its "Next" button
   *  can enable. Fires whenever the resume / avatar choices change. */
  onSelectionChange: (
    resume: Resume | null,
    includeAvatar: boolean,
    avatarFile: File | null,
  ) => void;
  isLoading?: boolean;
}

const projectSummaryToResume = (summary: any): Resume => ({
  id: summary.id || "",
  userId: summary.userId || "",
  title: summary.title || "Untitled Resume",
  slug: summary.slug ?? null,
  status: summary.status || "draft",
  privacy: summary.privacy || "private",
  isMaster: Boolean(summary.isMaster),
  isActive: Boolean(summary.isActive),
  parentId: summary.parentId ?? null,
  diffPercent: summary.diffPercent ?? null,
  templateId: summary.templateId ?? null,
  metaResumeId: summary.metaResumeId ?? null,
  sentimentScore: summary.sentimentScore ?? null,
  viewCount: summary.viewCount ?? 0,
  isOwner: Boolean(summary.isOwner),
  isWatched: Boolean(summary.isWatched),
  createdAt: summary.createdAt || "",
  updatedAt: summary.updatedAt || "",
  content: {
    basics: {
      name: summary.title || "",
      label: summary.headline || "",
      image: "",
      email: "",
      phone: "",
      url: "",
      summary: summary.summary || "",
      location: null,
    },
    work: [],
    volunteer: [],
    education: [],
    awards: [],
    certificates: [],
    publications: [],
    skills: [],
    languages: [],
    interests: [],
    references: [],
    projects: [],
    metaData: [],
  },
});

/**
 * Step 1: Resume Selection & Avatar Configuration
 *
 * Allows user to select a resume and optionally include their profile avatar.
 * If the user has no resumes, renders a drop-target so they can upload one
 * without leaving the wizard — the same `ResumeEmptyDropzone` component used
 * on /resumes and inside the Studio wizard, so the upload UX stays consistent.
 */
export function VideoResumeWizardStep1({
  onSelectionChange,
  isLoading = false,
}: VideoResumeWizardStep1Props) {
  const { user } = useAuth();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [includeAvatar, setIncludeAvatar] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loadingResumes, setLoadingResumes] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false);

  const loadResumes = useCallback(async (): Promise<Resume[]> => {
    const summaries = await resumeService.getUserResumes();
    const list = summaries.map(projectSummaryToResume);
    setResumes(list);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingResumes(true);
    loadResumes()
      .then((list) => {
        if (cancelled) return;
        const active = list.find((r) => r.isActive) ?? list[0];
        if (active) setSelectedResumeId(active.id);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load resumes");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingResumes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadResumes]);

  // Emit selection upward whenever it changes so parent's Next button can
  // gate on `state.selectedResume` and the avatar choices flow through.
  const selectedResume = resumes.find((r) => r.id === selectedResumeId) ?? null;
  useEffect(() => {
    onSelectionChange(selectedResume, includeAvatar, avatarFile);
  }, [selectedResume, includeAvatar, avatarFile, onSelectionChange]);

  const handleUploadSuccess = useCallback(
    async (response: ResumeUploadResponse) => {
      setUploadSheetOpen(false);
      const list = await loadResumes();
      const uploaded = list.find((r) => r.id === response.id);
      if (uploaded) setSelectedResumeId(uploaded.id);
    },
    [loadResumes],
  );

  if (loadingResumes) {
    return (
      <div className="space-y-4">
        <div className="h-12 bg-gray-200 rounded animate-pulse" />
        <div className="h-32 bg-gray-200 rounded animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (resumes.length === 0) {
    return (
      <ResumeEmptyDropzone
        title="You don't have any resumes yet"
        description="Drop your resume here, or click to upload — we'll parse it and continue with your video. Supports PDF, Word, Markdown, JSON, and text files."
        onUploadSuccess={handleUploadSuccess}
        compact
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Resume Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Select Resume</CardTitle>
              <CardDescription>
                Choose which resume to use for your video
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUploadSheetOpen(true)}
              disabled={isLoading}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload new
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a resume" />
            </SelectTrigger>
            <SelectContent>
              {resumes.map((resume) => (
                <SelectItem key={resume.id} value={resume.id}>
                  {resume.title}
                  {resume.isActive && " (Active)"}
                  {resume.isMaster && " (Master)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedResume && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg">
              <div className="text-sm font-medium mb-2">Resume Preview</div>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>
                  <strong>Title:</strong> {selectedResume.title}
                </div>
                <div>
                  <strong>Summary:</strong>{" "}
                  {selectedResume.content?.basics?.summary?.substring(0, 100)}
                  {selectedResume.content?.basics?.summary &&
                    selectedResume.content.basics.summary.length > 100 &&
                    "..."}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Avatar Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Avatar Configuration</CardTitle>
          <CardDescription>
            Optionally include your profile picture in the video
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="include-avatar"
              checked={includeAvatar}
              onCheckedChange={(checked) =>
                setIncludeAvatar(checked as boolean)
              }
              disabled={isLoading}
            />
            <Label htmlFor="include-avatar" className="cursor-pointer">
              Include my profile picture in the video
            </Label>
          </div>

          {includeAvatar && (
            <ProfileAvatarEditor
              currentAvatarUrl={user?.avatar}
              userName={selectedResume?.content?.basics?.name || "User"}
              onAvatarSelect={setAvatarFile}
              isLoading={isLoading}
              disabled={isLoading}
            />
          )}
        </CardContent>
      </Card>

      <ResumeUploadSheet
        open={uploadSheetOpen}
        onOpenChange={setUploadSheetOpen}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}

export default VideoResumeWizardStep1;
