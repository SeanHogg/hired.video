/**
 * Publishes the open job document to the AI coach's active-form bridge, so
 * `apply_job_draft` writes straight onto the canvas — the job-create form the
 * coach used to fill (JobCreatePage) is retired; the canvas is the form
 * (#1915). Registered only while a job document is open; the live draft also
 * streams into the coach's prompt.
 */
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { mediaKindIsDocument, type MediaKind } from "@shared/media-kinds";
import { useActiveFormBridge } from "@/lib/hooks/use-active-form-bridge";
import { useAIFormSnapshot } from "@/hooks/use-ai-form-snapshot";
import { usePermissions } from "@/hooks/use-permissions";
import type { ActiveFormHandle } from "@/lib/tools/active-form-bridge";
import { JOB_CREATE_FORM_ID } from "@/lib/tools/form-ids";
import type { DocumentEntityContent } from "@/lib/studio/editor-v2/document-state";
import type { DocumentRuntime } from "@/lib/studio/editor-v2/use-history-runtimes";
import type { JobDocumentContent } from "./job-content";
import {
  JOB_DRAFT_WRITABLE_FIELDS,
  applyJobDraftField,
  jobContentToDraftValues,
  type JobDraftField,
} from "./job-draft-fields";

const FIELD_LABEL_KEYS: Record<JobDraftField, string> = {
  title: "studioFields.job.title",
  description: "studioFields.job.about",
  company: "studioFields.job.company",
  location: "studioFields.job.location",
  responsibilities: "studioFields.job.responsibilities",
  requirements: "studioFields.job.requirements",
  employmentType: "studioFields.job.employmentType",
  seniority: "studioFields.job.seniority",
  workSetting: "studioFields.job.workSetting",
  salaryMin: "studioFields.job.salary",
  salaryMax: "studioFields.job.salaryMax",
  currency: "studioFields.job.currency",
};

const asJob = (c: DocumentEntityContent | null): JobDocumentContent | null =>
  c as unknown as JobDocumentContent | null;

export function useJobDocumentFormBridge(
  currentMediaKind: MediaKind,
  documentRuntime: DocumentRuntime,
): void {
  const { t } = useTranslation();
  const { documentState, documentStateHydrated, documentEntityContent, setDocumentEntityContent } = documentRuntime;
  // Writing a job posting is for recruiters / employers only (#1915) — the
  // bridge (and so the coach's `apply_job_draft`, which self-gates on it)
  // exists only for a viewer who may post jobs.
  const { canPostJobs } = usePermissions();
  const enabled =
    canPostJobs &&
    mediaKindIsDocument(currentMediaKind) &&
    documentStateHydrated &&
    documentState.entityKind === "job";
  // The coach reads the LIVE content; a ref keeps the handle stable.
  const contentRef = useRef(documentEntityContent);
  contentRef.current = documentEntityContent;

  const handle = useMemo<ActiveFormHandle<Record<JobDraftField, unknown>>>(
    () => ({
      formId: JOB_CREATE_FORM_ID,
      getValues: () => jobContentToDraftValues(asJob(contentRef.current)),
      setValue: (field, value) =>
        setDocumentEntityContent(
          (prev) => applyJobDraftField(asJob(prev), field, value) as unknown as DocumentEntityContent,
        ),
      writableFields: JOB_DRAFT_WRITABLE_FIELDS,
      fieldLabels: Object.fromEntries(
        JOB_DRAFT_WRITABLE_FIELDS.map((f) => [f, t(FIELD_LABEL_KEYS[f])]),
      ),
    }),
    [setDocumentEntityContent, t],
  );
  useActiveFormBridge(handle, enabled);
  // …and streams the draft into the coach's system prompt (#1621), as the
  // retired form did.
  useAIFormSnapshot(enabled ? jobContentToDraftValues(asJob(documentEntityContent)) : undefined);
}
