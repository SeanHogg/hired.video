import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import ResumeUpload from "@/components/ResumeUpload";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { resumeService } from "@/lib/services/resume-service";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import type { ResumeUploadResponse } from "@/types/resume";

export default function ResumeUploadPage() {
  const navigate = useNavigate();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated, user } = useAuth();

  const handleUploadSuccess = (response: ResumeUploadResponse) => {
    // Generate a new resume ID and navigate to create page with the uploaded data
    const newResumeId = generateResumeId();
    // In a real app, you would save the uploaded data and navigate to the create page
    navigate(`/resumes/create/${newResumeId}`, {
      state: {
        uploadedData: response.data,
        resumeName: response.message,
      },
    });
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
                <h1 className="text-3xl font-bold">Upload Resume</h1>
                <p className="text-muted-foreground">
                  Upload your existing resume and let AI convert it to our
                  format
                </p>
              </div>
              <Button variant="outline" onClick={handleCancel}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Resumes
              </Button>
            </div>

            {/* Upload Component */}
            <ResumeUpload
              onUploadSuccess={handleUploadSuccess}
              onCancel={handleCancel}
            />
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
