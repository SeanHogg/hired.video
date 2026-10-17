// Fire-and-forget download tracking for resume exports.
// Writes to activity_logs via POST /api/analytics/events (kind "activity") so we can later answer
// "how many times has resume X been downloaded, and in which format?"
// Also pushes a GTM event so marketing sees downloads in the funnel.

import { gtmEvent } from "@/lib/gtm";
import { apiClient } from "@/lib/api-client";
import { trackJobSeekerStage } from "@/lib/analytics/jobseeker-funnel";
import { ANALYTICS_EVENTS_PATH, type AnalyticsEventInput } from "@shared/analytics-events";

export type ResumeDownloadFormat = "pdf" | "word" | "json" | "text";

export function trackResumeDownload(resumeId: string, format: ResumeDownloadFormat): void {
  gtmEvent("resume_download", { resume_id: resumeId, format });
  trackJobSeekerStage("exported", { format });

  // suppressErrorEvent: never toast on a beacon failure — analytics
  // shouldn't surface errors to the user.
  const event: AnalyticsEventInput<"activity"> = {
    kind: "activity",
    event: "resume_download",
    entityType: "resume",
    entityId: resumeId,
    metadata: { format },
  };
  void apiClient
    .request(ANALYTICS_EVENTS_PATH, {
      method: "POST",
      body: event,
      suppressErrorEvent: true,
      retries: 0,
    })
    .catch(() => undefined);
}
