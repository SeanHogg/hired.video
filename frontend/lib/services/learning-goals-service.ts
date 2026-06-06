// learning-goals-service — client for /api/learning-goals. A learner's own
// stated objectives + the keyword-matched course recommendations they drive.

import { apiClient } from "../api-client";
import type { WishlistCourseCard } from "./lists-service";

export type LearningGoalStatus = "active" | "completed" | "paused" | "archived";

export interface LearningGoal {
  id: string;
  userId: string;
  goalText: string;
  status: LearningGoalStatus;
  source: "onboarding" | "manual";
  createdAt: string;
  updatedAt: string;
}

export const learningGoalsService = {
  async listMine(): Promise<LearningGoal[]> {
    const res = await apiClient.get<LearningGoal[]>("/api/learning-goals/me", undefined, {
      suppressErrorEvent: true,
    });
    return res.data ?? [];
  },

  async create(goalText: string, source: "onboarding" | "manual" = "manual"): Promise<LearningGoal> {
    const res = await apiClient.post<LearningGoal>("/api/learning-goals", { goalText, source });
    if (!res.data) throw new Error("Failed to save goal");
    return res.data;
  },

  async update(
    id: string,
    input: { goalText?: string; status?: LearningGoalStatus },
  ): Promise<LearningGoal> {
    const res = await apiClient.patch<LearningGoal>(`/api/learning-goals/${id}`, input);
    if (!res.data) throw new Error("Failed to update goal");
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/api/learning-goals/${id}`);
  },

  /** Published courses matching the goal text (keyword-ranked, marketplace
   *  card shape). */
  async recommendations(id: string): Promise<WishlistCourseCard[]> {
    const res = await apiClient.get<WishlistCourseCard[]>(
      `/api/learning-goals/${id}/recommendations`,
      undefined,
      { suppressErrorEvent: true },
    );
    return res.data ?? [];
  },
};
