import { useState, useCallback } from "react";
import type { ResumeWithOwnership, MasterResumeGroup } from "@/lib/services/resume-service";

interface OptimisticState {
  resumes: ResumeWithOwnership[];
  masterGroups: MasterResumeGroup[];
}

interface OptimisticActions {
  setMasterOptimistic: (resumeId: string) => void;
  setActiveOptimistic: (resumeId: string) => void;
  setPrivacyOptimistic: (resumeId: string, privacy: "public" | "recruiter_only" | "private" | "draft") => void;
  revertOptimistic: () => void;
  updateState: (newState: OptimisticState) => void;
}

export function useOptimisticResumes(
  initialResumes: ResumeWithOwnership[],
  initialMasterGroups: MasterResumeGroup[]
): [OptimisticState, OptimisticActions] {
  const [state, setState] = useState<OptimisticState>({
    resumes: initialResumes,
    masterGroups: initialMasterGroups,
  });

  const [originalState, setOriginalState] = useState<OptimisticState>({
    resumes: initialResumes,
    masterGroups: initialMasterGroups,
  });

  const setMasterOptimistic = useCallback((resumeId: string) => {
    setState(prevState => {
      // Store original state for potential revert
      setOriginalState(prevState);

      const updatedResumes = prevState.resumes.map(resume => ({
        ...resume,
        isMaster: resume.id === resumeId ? true : false,
      }));

      const updatedMasterGroups = prevState.masterGroups.map(group => ({
        ...group,
        masterResume: {
          ...group.masterResume,
          isMaster: group.masterResume.id === resumeId ? true : false,
        },
        variations: group.variations.map(variation => ({
          ...variation,
          isMaster: variation.id === resumeId ? true : false,
        })),
      }));

      return {
        resumes: updatedResumes,
        masterGroups: updatedMasterGroups,
      };
    });
  }, []);

  const setActiveOptimistic = useCallback((resumeId: string) => {
    setState(prevState => {
      // Store original state for potential revert
      setOriginalState(prevState);

      // Only one active master at a time; variations inherit from master
      const updatedResumes = prevState.resumes.map(resume => ({
        ...resume,
        isActive: resume.id === resumeId ? true : false,
      }));

      const updatedMasterGroups = prevState.masterGroups.map(group => {
        const isTargetMaster = group.masterResume?.id === resumeId;
        return {
          ...group,
          masterResume: group.masterResume ? {
            ...group.masterResume,
            isActive: isTargetMaster,
          } : group.masterResume,
          variations: group.variations.map(variation => ({
            ...variation,
            isActive: isTargetMaster ? true : false,
          })),
        };
      });

      return {
        resumes: updatedResumes,
        masterGroups: updatedMasterGroups,
      };
    });
  }, []);

  const setPrivacyOptimistic = useCallback((resumeId: string, privacy: "public" | "recruiter_only" | "private" | "draft") => {
    setState((prevState): OptimisticState => {
      // Store original state for potential revert
      setOriginalState(prevState);

      // Enforce exclusivity for public and recruiter_only across all resumes
      const updatedResumes: ResumeWithOwnership[] = prevState.resumes.map(resume => {
        if (resume.id === resumeId) {
          return { ...resume, privacy } as ResumeWithOwnership;
        }
        if (privacy === "public" && resume.privacy === "public") {
          return { ...resume, privacy: "private" } as ResumeWithOwnership;
        }
        if (privacy === "recruiter_only" && resume.privacy === "recruiter_only") {
          return { ...resume, privacy: "private" } as ResumeWithOwnership;
        }
        return resume;
      });

      const updatedMasterGroups: MasterResumeGroup[] = prevState.masterGroups.map(group => {
        const isTargetMaster = group.masterResume?.id === resumeId;
        return {
          ...group,
          masterResume: group.masterResume ? {
            ...group.masterResume,
            privacy: isTargetMaster ? privacy : (group.masterResume.privacy as any),
          } : group.masterResume,
          variations: group.variations.map(variation => {
            if (variation.id === resumeId) {
              return { ...variation, privacy } as any;
            }
            // Demote others with same privacy when exclusivity applies
            if (privacy === "public" && variation.privacy === "public") {
              return { ...variation, privacy: "private" } as any;
            }
            if (privacy === "recruiter_only" && variation.privacy === "recruiter_only") {
              return { ...variation, privacy: "private" } as any;
            }
            return variation;
          }),
        } as MasterResumeGroup;
      });

      return {
        resumes: updatedResumes,
        masterGroups: updatedMasterGroups,
      } as OptimisticState;
    });
  }, []);

  const revertOptimistic = useCallback(() => {
    setState(originalState);
  }, [originalState]);

  const updateState = useCallback((newState: OptimisticState) => {
    setState(newState);
    setOriginalState(newState);
  }, []);

  return [
    state,
    {
      setMasterOptimistic,
      setActiveOptimistic,
      setPrivacyOptimistic,
      revertOptimistic,
      updateState,
    },
  ];
}
