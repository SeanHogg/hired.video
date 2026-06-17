import React, { useState } from "react";
import { Target, Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { OnboardingTask } from "@/lib/services/dashboard-service";
import { taskService } from "@/lib/services/task-service";

interface OnboardingProgressProps {
  tasks: OnboardingTask[];
  completionPercentage?: number;
  loading?: boolean;
  onTaskComplete?: (taskId: string) => void;
  showAllTasksLink?: boolean;
}

const DISMISS_KEY = "onboarding_progress_dismissed_v1";

export function OnboardingProgress({
  tasks,
  completionPercentage,
  loading = false,
  onTaskComplete,
  showAllTasksLink = true,
}: OnboardingProgressProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return Boolean(localStorage.getItem(DISMISS_KEY));
    } catch {
      return false;
    }
  });
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [localCompleted, setLocalCompleted] = useState<Set<string>>(new Set());

  const completedTasksCount = tasks.filter((task) => task.completed).length;
  const progressPercentage = completionPercentage ?? (
    tasks.length > 0
      ? Math.round((completedTasksCount / tasks.length) * 100)
      : 0
  );

  // Don't show the component if progress is 100% or dismissed
  if (progressPercentage >= 100 || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDismissed(true);
  };

  if (loading) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-6 w-48 bg-muted rounded animate-pulse" />
              <div className="h-4 w-32 bg-muted rounded animate-pulse" />
            </div>
            <div className="text-right space-y-2">
              <div className="h-8 w-12 bg-muted rounded animate-pulse" />
              <div className="h-3 w-16 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-3 w-full bg-muted rounded animate-pulse mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={index}
                className="h-12 w-full bg-muted rounded animate-pulse"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleComplete = async (task: OnboardingTask) => {
    setCompletingId(task.id);
    try {
      await taskService.completeTask(task.id);
    } catch {
      // Best-effort — still navigate even if API fails
    }
    setLocalCompleted((prev) => new Set(prev).add(task.id));
    setCompletingId(null);
    onTaskComplete?.(task.id);
    if (task.url) {
      navigate(task.url);
    }
  };

  const isTaskDone = (task: OnboardingTask) =>
    task.completed || localCompleted.has(task.id);
  const incompleteTasks = tasks.filter((task) => !isTaskDone(task));
  const effectiveCompleted = completedTasksCount + localCompleted.size;
  const effectivePercentage = tasks.length > 0
    ? Math.round((effectiveCompleted / tasks.length) * 100)
    : progressPercentage;

  // Hide if all tasks completed (including locally completed ones)
  if (effectivePercentage >= 100) return null;

  const visibleTasks = tasks;
  const remainingTasksCount = incompleteTasks.length;

  return (
    <Card className="relative border-primary/20 bg-primary/5">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded hover:bg-muted text-muted-foreground transition-colors z-10"
        title={t("labels.dismiss")}
      >
        <X className="h-4 w-4" />
      </button>
      <CardHeader className="pr-10">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              {t("headings.completeYourSetup")}
            </CardTitle>
            <CardDescription>
              {t("messages.tasksCompleted", { completed: effectiveCompleted, total: tasks.length })}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">
              {effectivePercentage}%
            </div>
            <div className="text-xs text-muted-foreground">{t("labels.completePercent")}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Progress value={effectivePercentage} className="h-3 mb-4" />
        <div className="grid gap-2">
          {visibleTasks.map((task) => {
            const done = isTaskDone(task);
            const busy = completingId === task.id;
            return (
              <div
                key={task.id}
                className="flex items-center justify-between p-3 bg-background rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => !done && !busy && handleComplete(task)}
                    disabled={done || busy}
                    aria-label={done ? t("labels.taskCompletedAria") : t("labels.markTaskCompleteAria", { title: task.title })}
                    className={
                      done
                        ? "w-5 h-5 rounded-full bg-green-600 text-white flex items-center justify-center flex-shrink-0"
                        : "w-5 h-5 rounded-full border-2 border-muted-foreground flex items-center justify-center flex-shrink-0 hover:border-green-600 hover:bg-green-50 transition-colors"
                    }
                  >
                    {done && <Check className="h-3 w-3" strokeWidth={3} />}
                  </button>
                  <div>
                    <span
                      className={`font-medium ${done ? "line-through text-muted-foreground" : ""}`}
                    >
                      {task.title}
                    </span>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {task.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {remainingTasksCount > 0 && showAllTasksLink && (
          <Button variant="link" className="mt-2 p-0" onClick={() => navigate("/tasks")}>
            {t("actions.viewAllTasks", { remaining: remainingTasksCount })}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default OnboardingProgress;
