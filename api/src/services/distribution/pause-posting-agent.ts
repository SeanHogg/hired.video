/**
 * Pause the posting agent: disable settings and cancel open agent jobs.
 * One use case for the user kill switch, digest pause-link, admin kill switch, and Pro lapse (R8).
 */
import {
  disableAgent,
  type PostingAgentSettings,
} from "../../repositories/postingAgentSettingsRepository.js";
import { cancelOpenAgentJobs } from "../../repositories/socialPublishJobRepository.js";

export type PausedReason = "user" | "plan" | "admin";

export interface PausePostingAgentDeps {
  disableAgent: typeof disableAgent;
  cancelOpenAgentJobs: typeof cancelOpenAgentJobs;
}

const defaults: PausePostingAgentDeps = {
  disableAgent,
  cancelOpenAgentJobs,
};

export async function pausePostingAgent(
  userId: string,
  reason: PausedReason,
  deps: PausePostingAgentDeps = defaults,
): Promise<PostingAgentSettings> {
  const settings = await deps.disableAgent(userId, reason);
  await deps.cancelOpenAgentJobs(userId, new Date());
  return settings;
}
