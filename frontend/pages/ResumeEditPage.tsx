import { ArrowLeft, Video } from "lucide-react";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import ResumeBuilder from "@/components/ResumeBuilder";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { resumeService } from "@/lib/services/resume-service";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { Resume, UpdateResumeRequest, ResumeSectionMeta } from "@/types/resume";
import MetadataModal from "@/components/MetadataModal";

export default function ResumeEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
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

  const handleUpdateResume = async (request: UpdateResumeRequest) => {
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

    // For other updates (name/data), save to backend
    try {
      // Create the update payload
      const updatePayload = {
        name: request.name || resume.name,
        data: request.data || resume.data,
        privacy: request.privacy || resume.privacy,
        isMaster: request.isMaster !== undefined ? request.isMaster : resume.isMaster,
        slug: request.slug || resume.slug,
      };

      // Update the resume via API
      const updatedResume = await resumeService.updateResumeData(resume.id, updatePayload);
      
      // Update local state with the response
      setResume(updatedResume);
      
      toast({ 
        title: "Resume updated", 
        description: "Your changes have been saved successfully." 
      });
    } catch (err) {
      console.error("Failed to update resume:", err);
      toast({ 
        title: "Failed to update resume", 
        description: err instanceof Error ? err.message : "Please try again.", 
        variant: "destructive" 
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={sidebarCollapsed}
        />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />
          <div className="pt-16 p-6">
            <div className="max-w-4xl mx-auto">
              <div className="animate-pulse space-y-6">
                <div className="h-8 bg-muted rounded w-1/3" />
                <div className="h-64 bg-muted rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || (!loading && !resume)) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={sidebarCollapsed}
        />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />
          <div className="pt-16 p-6">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-2xl font-bold mb-4">
                {error ? "Error Loading Resume" : "Resume Not Found"}
              </h1>
              <p className="text-muted-foreground mb-6">
                {error || "The resume you're trying to edit doesn't exist."}
              </p>
              <div className="flex gap-4 justify-center">
                <Button onClick={() => navigate("/resumes")}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Resumes
                </Button>
                {error && (
                  <Button
                    variant="outline"
                    onClick={() => window.location.reload()}
                  >
                    Try Again
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check if user owns the resume
  const isOwner = user.id === resume.userId;
  if (!isOwner) {
    navigate(`/resumes/${resume.id}`);
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16 p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Edit Resume</h1>
                <div className="text-muted-foreground flex items-center gap-2">
                  <span>{resume.name}</span>
                  {resume.slug && (
                    <span className="text-xs text-muted-foreground/80">Slug: <span className="font-mono text-foreground">{resume.slug}</span></span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleAddMedia}>
                  <Video className="w-4 h-4 mr-2" />
                  Add Media
                </Button>
                <Button variant="outline" onClick={handleCancel}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to View
                </Button>
              </div>
            </div>

            {/* Resume Editor - direct builder in edit route */}
            <ResumeBuilder
              initialData={resume.data}
              initialName={resume.name}
              initialPrivacy={resume.privacy}
              initialIsMaster={resume.isMaster}
              initialSlug={resume.slug}
              onSave={handleUpdateResume}
              onCancel={handleCancel}
            />
          </div>
        </div>
        <Footer />
      </div>

      {resume && (
        <MetadataModal
          open={metadataModalOpen}
          onOpenChange={setMetadataModalOpen}
          resumeId={resume.id}
          initialMetadata={resume.metaData || []}
          onSave={handleSaveMetadata}
        />
      )}
    </div>
  );
}
