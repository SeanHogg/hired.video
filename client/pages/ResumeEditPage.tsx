import { ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import ResumeViewer from "@/components/ResumeViewer";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { resumeService } from "@/lib/services/resume-service";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import type { Resume, UpdateResumeRequest } from "@/types/resume";

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

  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadResume = async () => {
      if (!id) {
        navigate("/resumes");
        return;
      }

      setLoading(true);
      try {
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 500));

        const foundResume = await resumeService.getResumeById(id);
        if (foundResume) {
          setResume(foundResume as any);
        } else {
          navigate("/resumes");
        }
      } catch (error) {
        console.error("Failed to load resume:", error);
        navigate("/resumes");
      } finally {
        setLoading(false);
      }
    };

    loadResume();
  }, [id, navigate]);

  const handleUpdateResume = (request: UpdateResumeRequest) => {
    if (resume) {
      // In a real app, this would update the backend
      const updatedResume = { ...resume, ...request };
      setResume(updatedResume);

      // Navigate back to view mode
      navigate(`/resumes/${resume.id}`);
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

  if (!resume) {
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
              <h1 className="text-2xl font-bold mb-4">Resume Not Found</h1>
              <p className="text-muted-foreground mb-6">
                The resume you're trying to edit doesn't exist.
              </p>
              <Button onClick={() => navigate("/resumes")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Resumes
              </Button>
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
                <p className="text-muted-foreground">{resume.name}</p>
              </div>
              <Button variant="outline" onClick={handleCancel}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to View
              </Button>
            </div>

            {/* Resume Editor */}
            <ResumeViewer
              resume={resume}
              onUpdate={handleUpdateResume}
              canEdit
            />
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
