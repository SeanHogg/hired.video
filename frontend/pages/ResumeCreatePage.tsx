import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import EntityEditShell from "@/components/EntityEditShell";
import ResumeBuilder from "@/components/ResumeBuilder";
import { resumeService } from "@/lib/services/resume-service";
import { useAuth } from "@/lib/auth";
import type { CreateResumeRequest, ResumeData } from "@/types/resume";

export default function ResumeCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();

  const [initialData, setInitialData] = useState<
    Partial<ResumeData> | undefined
  >();

  useEffect(() => {
    // Check if we have uploaded data from the upload page
    if (location.state?.uploadedData) {
      setInitialData(location.state.uploadedData);
    }
  }, [location.state]);

  const handleCreateResume = async (request: CreateResumeRequest) => {
    try {
      const resumeRequest = {
        title: request.title || "New Resume",
        data: request.content as any,
        privacy: "private" as const,
        isMaster: true,
        isActive: true,
      };
      const savedResume = await resumeService.createResume(resumeRequest);
      console.log("Resume created successfully:", savedResume.id);
      navigate("/resumes");
    } catch (error) {
      console.error("Failed to create resume:", error);
    }
  };

  const handleCancel = () => {
    navigate("/resumes");
  };

  if (!isAuthenticated || !user) {
    navigate("/login");
    return null;
  }

  return (
    <EntityEditShell
      hubEntity="resume"
      parent={{ label: "Resumes", to: "/resumes", icon: FileText }}
      entity={{}}
      leafLabel="Create"
      description={
        initialData
          ? "Review and edit your uploaded resume"
          : "Build your resume from scratch"
      }
    >
      <ResumeBuilder
        onSave={handleCreateResume}
        onCancel={handleCancel}
        initialData={initialData}
      />
    </EntityEditShell>
  );
}
