/**
 * Hand a review (merge / tailor / create-for-job) to the kit workspace from a tool. On
 * its own page the tool navigates to the kit workspace; embedded in the kit workspace on the same
 * résumé (tool-embed.tsx) it opens the review right there — the kit workspace reads its
 * entry link only once, so navigating to it again would do nothing.
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ReviewHandoff } from "@/lib/build/review/use-review-handoff";
import { reviewHandoffLink } from "@/lib/build/review/review-handoff-link";
import { useToolEmbed } from "./tool-embed";

export function useOpenReview(): (resumeId: string, handoff: ReviewHandoff) => void {
  const embed = useToolEmbed();
  const navigate = useNavigate();
  return useCallback(
    (resumeId: string, handoff: ReviewHandoff) => {
      if (embed && embed.resumeId === resumeId) {
        embed.openReview(handoff);
        return;
      }
      const { path, state } = reviewHandoffLink(resumeId, handoff);
      navigate(path, { state });
    },
    [embed, navigate],
  );
}
