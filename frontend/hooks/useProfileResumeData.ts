import { useState, useEffect, useCallback } from "react";
import { resumeService } from "@/lib/services/resume-service";
import type { Resume } from "@/types/resume";

interface UseProfileResumeDataReturn {
  masterResume: Resume | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches the current authenticated user's master resume with full data
 * (Work, Education, Skills, Projects, etc.) for inline display on the profile page.
 */
export function useProfileResumeData(): UseProfileResumeDataReturn {
  const [masterResume, setMasterResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMasterResume = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get the user's resume list
      const resumes = await resumeService.getUserResumes();

      // Find the master resume (API may return PascalCase or camelCase)
      const master = resumes.find(
        (r: any) => r.isMaster === true || r.IsMaster === true,
      );
      if (!master) {
        setMasterResume(null);
        return;
      }

      // Resolve ID (API may return PascalCase or camelCase)
      const resumeId = (master as any).id || (master as any).Id;
      if (!resumeId) {
        setMasterResume(null);
        return;
      }

      // Fetch full resume data including Work, Education, Skills, etc.
      const fullResume = await resumeService.getResumeById(resumeId);
      setMasterResume(fullResume);
    } catch (err) {
      console.error("Failed to fetch master resume:", err);
      setError(err instanceof Error ? err.message : "Failed to load resume data");
      setMasterResume(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMasterResume();
  }, [fetchMasterResume]);

  return { masterResume, loading, error, refetch: fetchMasterResume };
}
