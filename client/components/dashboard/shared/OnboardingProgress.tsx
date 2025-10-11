import React from "react";
import { Target, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
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

interface OnboardingProgressProps {
  tasks: OnboardingTask[];
  completionPercentage?: number;
  loading?: boolean;
  onTaskComplete?: (taskId: string) => void;
  showAllTasksLink?: boolean;
  maxVisibleTasks?: number;
}

export function OnboardingProgress({
  tasks,
  completionPercentage,
  loading = false,
  onTaskComplete,
  showAllTasksLink = true,
  maxVisibleTasks = 2,
}: OnboardingProgressProps) {
  const completedTasksCount = tasks.filter((task) => task.completed).length;
  const progressPercentage = completionPercentage ?? (
    tasks.length > 0
      ? Math.round((completedTasksCount / tasks.length) * 100)
      : 0
  );

  // Don't show the component if progress is 100%
  if (progressPercentage >= 100) {
    return null;
  }

  if (loading) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            </div>
            <div className="text-right space-y-2">
              <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" />
              <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-3 w-full bg-gray-200 rounded animate-pulse mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={index}
                className="h-12 w-full bg-gray-200 rounded animate-pulse"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const incompleteTasks = tasks.filter((task) => !task.completed);
  const visibleTasks = incompleteTasks.slice(0, maxVisibleTasks);
  const remainingTasksCount = incompleteTasks.length - maxVisibleTasks;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Complete Your Setup
            </CardTitle>
            <CardDescription>
              {completedTasksCount} of {tasks.length} tasks completed
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">
              {progressPercentage}%
            </div>
            <div className="text-xs text-muted-foreground">Complete</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Progress value={progressPercentage} className="h-3 mb-4" />
        <div className="grid gap-2">
          {visibleTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between p-3 bg-background rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-muted-foreground rounded-full" />
                <div>
                  <span className="font-medium">{task.title}</span>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {task.description}
                    </p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onTaskComplete?.(task.id)}
                asChild={!!task.url}
              >
                {task.url ? (
                  <Link to={task.url}>
                    Complete
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                ) : (
                  <>
                    Complete
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
        {remainingTasksCount > 0 && showAllTasksLink && (
          <Link to="/onboarding">
            <Button variant="link" className="mt-2 p-0">
              View all tasks ({remainingTasksCount} remaining)
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

export default OnboardingProgress;
