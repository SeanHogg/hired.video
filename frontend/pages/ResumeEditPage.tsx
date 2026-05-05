import { Video, FileText } from "lucide-react";
import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import EntityEditShell from "@/components/EntityEditShell";
import ResumeBuilder from "@/components/ResumeBuilder";
import { Button } from "@/components/ui/button";
import { resumeService } from "@/lib/services/resume-service";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { Resume, CreateResumeRequest, ResumeSectionMeta } from "@/types/resume";
import MetadataModal from "@/components/MetadataModal";

export default function ResumeEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Profile's section pencil links here with `?section=work` (etc.) so the
  // editor opens on the tab the user actually clicked.
  const initialTab = searchParams.get("section") ?? undefined;
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();

  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Metadata modal state
  const [metadataModalOpen, setMetadataModalOpen] = useState(false);

  const handleAddMedia = () => setMetadataModalOpen(true);

  const handleSaveMetadata = async (metadata: ResumeSectionMeta[]) => {
    if (!resume?.id) return;
    await resumeService.updateResumeMetadata(resume.id, metadata);
    const updatedResume = await resumeService.getResumeById(resume.id);
    setResume(updatedResume);
  };

  useEffect(() => {
    const loadResume = async () => {
      if (!id) {
        navigate("/resumes");
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const foundResume = await resumeService.getResumeById(id);
        if (foundResume) {
          setResume(foundResume);
        } else {
          setError("Resume not found");
          console.error("Resume not found");
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to load resume";
        setError(errorMessage);
        console.error("Failed to load resume:", error);
      } finally {
        setLoading(false);
      }
    };

    loadResume();
  }, [id, navigate]);

  const handleUpdateResume = async (request: CreateResumeRequest) => {
    if (!resume) return;

    // Handle privacy change immediately via backend API, but do not navigate away
    if (request.privacy && request.privacy !== resume.privacy) {
      const previous = resume.privacy;
      // Optimistic UI update
      setResume({ ...resume, privacy: request.privacy });
      try {
        const ok = await resumeService.setResumePrivacy(resume.id, request.privacy);
        if (!ok) throw new Error("Server rejected privacy change");
        toast({ title: "Visibility updated", description: `Set to ${request.privacy.replace("_", " ")}.` });
      } catch (err) {
        // Revert on failure
        setResume({ ...resume, privacy: previous });
        toast({ title: "Failed to update visibility", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
      }
      return;
    }

    // For other updates (title/content), save to backend
    try {
      const updatePayload = {
        title: request.title || resume.title,
        data: (request.content ?? resume.content) as any,
        privacy: request.privacy || resume.privacy,
        isMaster: request.isMaster !== undefined ? request.isMaster : resume.isMaster,
        slug: request.slug,
      };
      const updatedResume = await resumeService.updateResumeData(resume.id, updatePayload);

      // Update local state with the response
      setResume(updatedResume);

      toast({
        title: "Resume updated",
        description: "Your changes have been saved successfully.",
      });
    } catch (err) {
      console.error("Failed to update resume:", err);
      toast({
        title: "Failed to update resume",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    if (resume) {
      navigate(`/resumes/${resume.id}`);
    } else {
      navigate("/resumes");
    }
  };

  if (!isAuthenticated || !user) {
    navigate("/login");
    return null;
  }

  // Trust the server's `isOwner` flag — computed from the request's auth
  // sub compared against the resume's userId. The local `user.id` is
  // `profile.id` (from `userProfileToUser`), which does NOT always equal
  // the auth sub that the backend sees, so the old
  // `user.id === resume.userId` check spuriously redirected the owner to
  // the read-only view page and the Edit page rendered as an empty shell
  // for a split second before the redirect took effect.
  if (resume && !resume.isOwner) {
    navigate(`/resumes/${resume.id}`);
    return null;
  }

  const description = resume ? (
    <span className="flex items-center gap-2">
      <span>{resume.title}</span>
      {resume.slug && (
        <span className="text-xs text-muted-foreground/80">
          Slug: <span className="font-mono text-foreground">{resume.slug}</span>
        </span>
      )}
    </span>
  ) : undefined;

  return (
    <>
      <EntityEditShell
        parent={{ label: "Resumes", to: "/resumes", icon: FileText }}
        entity={{ label: resume?.title, to: resume ? `/resumes/${resume.id}` : undefined }}
        description={description}
        loading={loading}
        notFound={!loading && (!!error || !resume)}
        notFoundLabel={error ? "Error Loading Resume" : "Resume Not Found"}
        notFoundMessage={error ?? "The resume you're trying to edit doesn't exist."}
        extraActions={
          resume ? (
            <Button variant="outline" onClick={handleAddMedia}>
              <Video className="w-4 h-4 mr-2" />
              Add Media
            </Button>
          ) : undefined
        }
      >
        {resume && (
          <ResumeBuilder
            initialData={resume.content}
            initialName={resume.title}
            initialPrivacy={resume.privacy}
            initialIsMaster={resume.isMaster}
            initialSlug={resume.slug}
            initialTab={initialTab}
            onSave={handleUpdateResume}
            onCancel={handleCancel}
          />
        )}
      </EntityEditShell>

      {resume && (
        <MetadataModal
          open={metadataModalOpen}
          onOpenChange={setMetadataModalOpen}
          resumeId={resume.id}
          initialMetadata={resume.content.metaData || []}
          onSave={handleSaveMetadata}
        />
      )}
    </>
  );
}
