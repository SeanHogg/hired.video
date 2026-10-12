/** `?editJob=<id>` — open a job posting on the document canvas. */
import { jobService } from "@/lib/services/job-service";
import { createJobDocumentState } from "@/lib/studio/editor-v2/document-state";
import { documentEditEntry } from "./document";

export const jobEditEntry = documentEditEntry("job", async (id, { t }) => {
  const job = await jobService.getJobById(id);
  return {
    name: job.title || t("labels.studioLanding.jobFallbackName"),
    documentState: createJobDocumentState(id, () => crypto.randomUUID()),
  };
});
