// Job-seeker journey stage events (résumé create → sign up → export →
// publish). Read back by the admin Traffic view through the funnel registry
// in shared/usage.ts (USAGE_FUNNELS "jobseeker"). Call at the single seam
// where each stage succeeds, never in a component.

import { trackFunnelStage } from "@/lib/usage-tracker";
import { JOB_SEEKER_FUNNEL_KEY, type JobSeekerFunnelStage } from "@shared/usage";

const CONVERSION_STAGES: ReadonlySet<JobSeekerFunnelStage> = new Set(["signed_up", "published"]);

export function trackJobSeekerStage(stage: JobSeekerFunnelStage, payload?: Record<string, unknown>): void {
  trackFunnelStage(JOB_SEEKER_FUNNEL_KEY, stage, { conversion: CONVERSION_STAGES.has(stage), payload });
}
