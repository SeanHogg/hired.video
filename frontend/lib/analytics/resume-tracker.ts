// Fire-and-forget download tracking for resume exports.
// Writes to activity_logs via /api/analytics/beacon so we can later answer
// "how many times has resume X been downloaded, and in which format?"
// Also pushes a GTM event so marketing sees downloads in the funnel.

import { gtmEvent } from "@/lib/gtm";
import { apiClient } from "@/lib/api-client";
import { trackJobSeekerStage } from "@/lib/analytics/jobseeker-funnel";

export type ResumeDownloadFormat = "pdf" | "word" | "json" | "text";

export function trackResumeDownload(resumeId: string, format: ResumeDownloadFormat): void {
  gtmEvent("resume_download", { resume_id: resumeId, format });
  trackJobSeekerStage("exported", { format });

  // suppressErrorEvent: never toast on a beacon failure — analytics
  // shouldn't surface errors to the user.
  void apiClient
    .request("/api/analytics/beacon", {
      method: "POST",
      body: {
        event: "resume_download",
        entityType: "resume",
        entityId: resumeId,
        metadata: { format },
      },
      suppressErrorEvent: true,
      retries: 0,
    })
    .catch(() => undefined);
}
