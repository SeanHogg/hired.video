import { useEffect, useState } from "react";
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
import { resumeService, type ResumeSummary } from "@/lib/services/resume-service";
import { useAuth } from "@/lib/auth";
import type { Resume } from "@/types/resume";

interface VideoResumeWizardStep1Props {
  onComplete: (resume: Resume, includeAvatar: boolean, avatarFile: File | null) => void;
  isLoading?: boolean;
}

/**
 * Step 1: Resume Selection & Avatar Configuration
 * Allows user to select a resume and optionally include their profile avatar
 */
export function VideoResumeWizardStep1({
  onComplete: _onComplete,
  isLoading = false,
}: VideoResumeWizardStep1Props) {
  const { user } = useAuth();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [includeAvatar, setIncludeAvatar] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [loadingResumes, setLoadingResumes] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user's resumes on mount
  useEffect(() => {
    const loadResumes = async () => {
      try {
        setLoadingResumes(true);
        const resumeSummaries = await resumeService.getUserResumes();

        // Transform ResumeSummary to Resume type for the wizard
        const transformedResumes: Resume[] = resumeSummaries.map((summary: ResumeSummary) => ({
          id: summary.Id || summary.id || "",
          slug: summary.Slug || summary.slug || "",
          name: summary.Name || summary.name || "Untitled Resume",
          data: {
            Basics: {
              Name: summary.Name || summary.name || "",
              Label: "",
              Image: "",
              Email: "",
              Phone: "",
              Url: "",
              Summary: summary.Description || summary.description || "",
              Location: null,
            },
            Work: [],
            Volunteer: [],
            Education: [],
            Awards: [],
            Certificates: [],
            Publications: [],
            Skills: [],
            Languages: [],
            Interests: [],
            References: [],
            Projects: [],
          },
          privacy: "private" as const,
          isMaster: summary.IsPrimaryDefault || summary.isPrimaryDefault || false,
          isActive: false,
          createdAt: summary.CreationDateTimeFormatted || summary.createdAt || "",
          updatedAt: summary.CreationDateTimeFormatted || summary.updatedAt || "",
          views: 0,
          userId: summary.UserId || summary.userId || "",
        }));

        setResumes(transformedResumes);

        // Auto-select first resume or active resume
        const activeResume = transformedResumes.find((r) => r.isActive);
        if (activeResume) {
          setSelectedResumeId(activeResume.id);
        } else if (transformedResumes.length > 0) {
          setSelectedResumeId(transformedResumes[0].id);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load resumes",
        );
      } finally {
        setLoadingResumes(false);
      }
    };

    loadResumes();
  }, []);



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
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">
          You don't have any resumes yet. Create one to generate a video.
        </p>
      </div>
    );
  }

  const selectedResume = resumes.find((r) => r.id === selectedResumeId);

  return (
    <div className="space-y-6">
      {/* Resume Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Resume</CardTitle>
          <CardDescription>
            Choose which resume to use for your video
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a resume" />
            </SelectTrigger>
            <SelectContent>
              {resumes.map((resume) => (
                <SelectItem key={resume.id} value={resume.id}>
                  {resume.name}
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
                  <strong>Title:</strong> {selectedResume.name}
                </div>
                <div>
                  <strong>Summary:</strong>{" "}
                  {selectedResume.data?.Basics?.Summary?.substring(0, 100)}
                  {selectedResume.data?.Basics?.Summary &&
                    selectedResume.data.Basics.Summary.length > 100 &&
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
              userName={selectedResume?.data?.Basics?.Name || "User"}
              onAvatarSelect={setAvatarFile}
              isLoading={isLoading}
              disabled={isLoading}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default VideoResumeWizardStep1;

