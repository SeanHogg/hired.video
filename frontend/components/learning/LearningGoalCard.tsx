// LearningGoalCard — the learning-goal onboarding wedge. Self-gating: renders
// nothing for signed-out viewers. When the learner has no active goal it shows
// a single-question capture ("What do you want to learn next?"); once a goal is
// set it shows the goal + keyword-matched course recommendations.
//
// Drop it on the learner home / dashboard:
//   <LearningGoalCard source="onboarding" />

import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2, Sparkles, Target, Wand2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BaseCard from "@/components/ui/BaseCard";
import { CardContent } from "@/components/ui/card";
import CourseMarketplaceCard from "@/components/CourseMarketplaceCard";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/auth";
import { generateGoalPath } from "@/lib/courses/courses-api";
import {
  learningGoalsService,
  type LearningGoal,
} from "@/lib/services/learning-goals-service";

const GOALS_KEY = ["learning-goals", "me"] as const;

export default function LearningGoalCard({
  source = "manual",
  className,
}: {
  source?: "onboarding" | "manual";
  className?: string;
}) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data: goals = [], isLoading } = useQuery({
    queryKey: GOALS_KEY,
    queryFn: () => learningGoalsService.listMine(),
    enabled: isAuthenticated,
  });

  const activeGoal = goals.find((g) => g.status === "active") ?? null;

  const createGoal = useMutation({
    mutationFn: (text: string) => learningGoalsService.create(text, source),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: GOALS_KEY });
    },
    onError: (e) =>
      toast({
        title: "Couldn't save your goal",
        description: e.message,
        variant: "destructive",
      }),
  });

  const clearGoal = useMutation({
    mutationFn: (id: string) =>
      learningGoalsService.update(id, { status: "archived" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GOALS_KEY }),
  });

  // Self-gating.
  if (!isAuthenticated) return null;
  if (isLoading) return null;

  if (!activeGoal) {
    return (
      <BaseCard hover={false} className={className}>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">What do you want to learn next?</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Tell us your goal and we'll line up courses to get you there.
          </p>
          <form
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const text = draft.trim();
              if (text.length < 2) return;
              createGoal.mutate(text);
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. Retrieval-Augmented Generation, prompt engineering…"
              maxLength={280}
              className="flex-1"
            />
            <Button type="submit" disabled={createGoal.isPending || draft.trim().length < 2}>
              {createGoal.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Set goal"
              )}
            </Button>
          </form>
        </CardContent>
      </BaseCard>
    );
  }

  return (
    <div className={className}>
      <GoalWithRecommendations goal={activeGoal} onClear={() => clearGoal.mutate(activeGoal.id)} />
    </div>
  );
}

function GoalWithRecommendations({
  goal,
  onClear,
}: {
  goal: LearningGoal;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const { data: recs = [], isLoading } = useQuery({
    queryKey: ["learning-goals", "recs", goal.id, goal.goalText],
    queryFn: () => learningGoalsService.recommendations(goal.id),
  });

  // #2068 GAP-3 — materialise a draft learning path from this goal via the LLM.
  const generatePlan = useMutation({
    mutationFn: () => generateGoalPath(goal.id),
    onSuccess: (res) =>
      toast({
        title: t("learn.goalPlan.created"),
        description: res.path.title,
      }),
    onError: () => toast({ title: t("learn.goalPlan.error"), variant: "destructive" }),
  });

  return (
    <BaseCard hover={false}>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Your learning goal</div>
              <h2 className="font-semibold truncate">{goal.goalText}</h2>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground shrink-0"
            onClick={onClear}
          >
            <X className="h-3.5 w-3.5" /> Change
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : recs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No matching courses yet — we'll surface them here as the library grows.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Recommended to reach your goal:
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => generatePlan.mutate()}
                disabled={generatePlan.isPending}
              >
                {generatePlan.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                {generatePlan.isPending
                  ? t("learn.goalPlan.generating")
                  : t("learn.goalPlan.generate")}
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recs.map((course) => (
                <CourseMarketplaceCard key={course.id} item={course} />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </BaseCard>
  );
}
