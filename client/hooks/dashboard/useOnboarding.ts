import { useMemo } from "react";
import type { OnboardingTask } from "@/lib/services/dashboard-service";

interface UseOnboardingReturn {
  tasks: OnboardingTask[];
  completedTasksCount: number;
  totalTasksCount: number;
  progressPercentage: number;
  incompleteTasks: OnboardingTask[];
  isComplete: boolean;
}

export function useOnboarding(
  tasks: OnboardingTask[] = [],
): UseOnboardingReturn {
  const onboardingData = useMemo(() => {
    const completedTasksCount = tasks.filter((task) => task.completed).length;
    const totalTasksCount = tasks.length;
    const progressPercentage =
      totalTasksCount > 0
        ? Math.round((completedTasksCount / totalTasksCount) * 100)
        : 0;
    const incompleteTasks = tasks.filter((task) => !task.completed);
    const isComplete = progressPercentage >= 100;

    return {
      tasks,
      completedTasksCount,
      totalTasksCount,
      progressPercentage,
      incompleteTasks,
      isComplete,
    };
  }, [tasks]);

  return onboardingData;
}

export default useOnboarding;
