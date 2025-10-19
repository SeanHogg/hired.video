import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { VideoResumeWizard } from "@/components/VideoResumeWizard";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { useSidebar } from "@/hooks/use-sidebar";
import { useSEO } from "@/lib/seo";
import { useLocation } from "react-router-dom";

/**
 * Video Resume Wizard Page
 * Route: /resumes/upload/video
 * 
 * Dedicated page for the video resume creation wizard.
 * Users can create AI-powered video resumes from their existing resumes.
 */
export default function VideoResumeWizardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  // SEO for video resume wizard page
  useSEO(location.pathname);

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    navigate("/login", { replace: true });
    return null;
  }

  const handleClose = () => {
    navigate("/resumes", { replace: true });
  };

  const handleVideoGenerated = (videoId: string) => {
    // Navigate to the generated video or success page
    navigate(`/resumes/${videoId}`, { replace: true });
  };

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
            <VideoResumeWizard
              onClose={handleClose}
              onVideoGenerated={handleVideoGenerated}
            />
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}

