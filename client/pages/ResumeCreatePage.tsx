import { ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import ResumeBuilder from "@/components/ResumeBuilder";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { resumeService } from "@/lib/services/resume-service";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import type { CreateResumeRequest, ResumeData } from "@/types/resume";

export default function ResumeCreatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated, user } = useAuth();

  const [resumeId] = useState(id || generateResumeId());
  const [initialData, setInitialData] = useState<
    Partial<ResumeData> | undefined
  >();

  useEffect(() => {
    // Check if we have uploaded data from the upload page
    if (location.state?.uploadedData) {
      setInitialData(location.state.uploadedData);
    }
  }, [location.state]);

  const handleCreateResume = (request: CreateResumeRequest) => {
    // In a real app, this would save to the backend
    console.log("Creating resume with ID:", resumeId, request);

    // Navigate to the view page for the new resume
    navigate(`/resumes/${resumeId}`);
  };

  const handleCancel = () => {
    navigate("/resumes");
  };

  if (!isAuthenticated || !user) {
    navigate("/login");
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
                <h1 className="text-3xl font-bold">Create Resume</h1>
                <p className="text-muted-foreground">
                  {initialData
                    ? "Review and edit your uploaded resume"
                    : "Build your resume from scratch"}
                </p>
              </div>
              <Button variant="outline" onClick={handleCancel}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Resumes
              </Button>
            </div>

            {/* Builder Component */}
            <ResumeBuilder
              onSave={handleCreateResume}
              onCancel={handleCancel}
              initialData={initialData}
            />
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
