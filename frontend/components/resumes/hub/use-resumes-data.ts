import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resumeService } from "@/lib/services/resume-service";
import type { MasterResumeGroup } from "@/lib/services/resume-service";
import { useOptimisticResumes } from "@/hooks/useOptimisticResumes";
import { notifyExtension } from "@/hooks/use-extension-bridge";
import type { Resume, ResumeWithOwnership } from "@/types/resume";

export type LoadResumesOptions = { notifyExtension?: boolean };

/**
 * Owns the /resumes data: the owned list + master groups (with the
 * optimistic overlay), the single-resume viewer load for /resumes/:id,
 * the include-archived filter and the extension "resume-changed" refetch.
 */
export function useResumesData(id: string | undefined, isAuthenticated: boolean) {
  const { t } = useTranslation();
  const [view, setView] = useState<"list" | "viewer">("list");
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [resumes, setResumes] = useState<ResumeWithOwnership[]>([]);
  const [masterResumeGroups, setMasterResumeGroups] = useState<MasterResumeGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optimistic updates
  const [optimisticState, optimisticActions] = useOptimisticResumes(resumes, masterResumeGroups);

  // Use optimistic state for rendering
  const displayResumes = optimisticState.resumes;

  /** #154 — toggle to include archived rows. */
  const [includeArchived, setIncludeArchived] = useState(false);

  // Consolidated fetch
  const getResumesForDisplay = async (): Promise<ResumeWithOwnership[]> => {
    try {
      return await resumeService.getResumesForDisplay({ includeArchived });
    } catch (error) {
      console.error("Error fetching resumes:", error);
      return [];
    }
  };

  const loadResumes = async (opts?: LoadResumesOptions) => {
    setLoading(true);
    setError(null);
    if (opts?.notifyExtension) notifyExtension("resume-changed");
    try {
      const [masterGroups, finalResumes] = await Promise.all([
        resumeService.getMasterResumeGroups(),
        getResumesForDisplay(),
      ]);

      setResumes(finalResumes);
      setMasterResumeGroups(masterGroups);

      // Update optimistic state with fresh data
      optimisticActions.updateState({
        resumes: finalResumes,
        masterGroups,
      });
    } catch (error) {
      console.error("Failed to load resumes:", error);
      setError(t("errors.resumes.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const loadResumeById = async (resumeId: string) => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      // Fetch the full resume via the canonical endpoint rather than
      // fabricating a mock from summary metadata.
      const fullResume = await resumeService.getResumeById(resumeId);
      setSelectedResume(fullResume);
      setView("viewer");
    } catch (error) {
      console.error("Failed to load resume:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadResumeById(id);
      return;
    }
    if (isAuthenticated) {
      loadResumes();
    }
    // includeArchived is in the dep list so toggling it re-fetches with
    // the new filter without a router-level navigation.
  }, [id, isAuthenticated, includeArchived]);

  // The Chrome extension's side panel can upload resumes into the same
  // account while this page is open. The extension's auth-bridge content
  // script forwards a window-level CustomEvent on successful upload —
  // listen for it here and re-fetch so the new row appears without the
  // user having to hit F5. No-op when the extension isn't installed.
  useEffect(() => {
    if (!isAuthenticated || id) return;
    const onExtensionEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === 'resume-changed') loadResumes();
    };
    window.addEventListener('hired.video:extension-event', onExtensionEvent);
    return () => window.removeEventListener('hired.video:extension-event', onExtensionEvent);
  }, [isAuthenticated, id]);

  return {
    view,
    setView,
    selectedResume,
    resumes,
    setResumes,
    masterResumeGroups,
    setMasterResumeGroups,
    loading,
    error,
    displayResumes,
    optimisticActions,
    includeArchived,
    setIncludeArchived,
    getResumesForDisplay,
    loadResumes,
  };
}

export type ResumesData = ReturnType<typeof useResumesData>;
