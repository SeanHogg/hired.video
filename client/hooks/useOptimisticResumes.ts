import { useState, useCallback } from "react";
import type { ResumeWithOwnership, MasterResumeGroup } from "@/lib/services/resume-service";

interface OptimisticState {
  resumes: ResumeWithOwnership[];
  masterGroups: MasterResumeGroup[];
}

interface OptimisticActions {
  setMasterOptimistic: (resumeId: string) => void;
  setActiveOptimistic: (resumeId: string) => void;
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

      const updatedResumes = prevState.resumes.map(resume => ({
        ...resume,
        isActive: resume.id === resumeId ? true : false,
      }));

      const updatedMasterGroups = prevState.masterGroups.map(group => ({
        ...group,
        masterResume: {
          ...group.masterResume,
          isActive: group.masterResume.id === resumeId ? true : false,
        },
        variations: group.variations.map(variation => ({
          ...variation,
          isActive: variation.id === resumeId ? true : false,
        })),
      }));

      return {
        resumes: updatedResumes,
        masterGroups: updatedMasterGroups,
      };
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
      revertOptimistic,
      updateState,
    },
  ];
}
