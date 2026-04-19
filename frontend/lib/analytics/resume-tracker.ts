// Fire-and-forget download tracking for resume exports.
// Writes to activity_logs via /api/analytics/beacon so we can later answer
// "how many times has resume X been downloaded, and in which format?"
// Also pushes a GTM event so marketing sees downloads in the funnel.

import { gtmEvent } from "@/lib/gtm";
import { runtimeConfig } from "@/lib/runtime-config";

export type ResumeDownloadFormat = "pdf" | "word" | "json" | "text";

export function trackResumeDownload(resumeId: string, format: ResumeDownloadFormat): void {
  gtmEvent("resume_download", { resume_id: resumeId, format });

  try {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const url = `${runtimeConfig.apiUrl.replace(/\/$/, "")}/api/analytics/beacon`;
    void fetch(url, {
      method: "POST",
      headers,
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({
        event: "resume_download",
        entityType: "resume",
        entityId: resumeId,
        metadata: { format },
      }),
    }).catch(() => undefined);
  } catch {
    // never break the app for analytics
  }
}
