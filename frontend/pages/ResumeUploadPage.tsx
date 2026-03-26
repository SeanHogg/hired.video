import { Navigate } from "react-router-dom";

/**
 * The standalone upload page has been replaced by the ResumeUploadSheet
 * slide-out panel on the /resumes page. Redirect any direct links gracefully.
 */
export default function ResumeUploadPage() {
  return <Navigate to="/resumes" replace />;
}
