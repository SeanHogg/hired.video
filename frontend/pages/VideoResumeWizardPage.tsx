import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { VideoResumeWizard } from "@/components/VideoResumeWizard";
import { AppShell } from "@/components/AppShell";
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
    <AppShell bgClassName="bg-background">
<div className="pt-16 p-6">
          <div className="max-w-4xl mx-auto">
            <VideoResumeWizard
              onClose={handleClose}
              onVideoGenerated={handleVideoGenerated}
            />
          </div>
        </div>
</AppShell>
  );
}

