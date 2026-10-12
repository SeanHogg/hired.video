/**
 * The job document's inspector (studio right slot) — the job fields the
 * canvas sections don't hold (#1915, carried from the retired JobCreatePage):
 *   • the attached studio video (`videoProjectId`, JobStudioVideoPickerField);
 *   • structured geo tags (the shared LocationPicker → content_locations,
 *     written by `persistDocumentEntity` with the row);
 *   • once saved, the screening setup (#1918).
 * Edits flow into the document's entity content like a canvas field, so
 * autosave persists them.
 */
import { useTranslation } from "react-i18next";
import { ClipboardCheck } from "lucide-react";
import { publicJobPath } from "@shared/public-paths";
import { Button } from "@/components/ui/button";
import { LocationPicker } from "@/components/location/LocationPicker";
import JobStudioVideoPickerField from "@/components/jobs/JobStudioVideoPickerField";
import type { ContentLocationSet } from "@shared/content-locations";
import type { DocumentEntityContent } from "@/lib/studio/editor-v2/document-state";
import { emptyJobContent, type JobDocumentContent } from "@/lib/studio/document/job-content";

const NO_LOCATIONS: ContentLocationSet = { origin: null, serves: [] };

interface JobDocumentInspectorProps {
  entityId: string | null;
  content: DocumentEntityContent | null;
  onContentChange: (update: (prev: DocumentEntityContent | null) => DocumentEntityContent | null) => void;
  navigate: (to: string) => void;
}

export default function JobDocumentInspector({ entityId, content, onContentChange, navigate }: JobDocumentInspectorProps) {
  const { t } = useTranslation();
  const job = (content as unknown as JobDocumentContent | null) ?? null;
  const patch = (fields: Partial<JobDocumentContent>) =>
    onContentChange((prev) => {
      const base = (prev as unknown as JobDocumentContent | null) ?? emptyJobContent();
      return { ...base, ...fields } as unknown as DocumentEntityContent;
    });

  return (
    <div className="space-y-5 p-3 text-sm">
      <JobStudioVideoPickerField value={job?.videoProjectId ?? ""} onChange={(id) => patch({ videoProjectId: id })} />
      <LocationPicker
        value={job?.locations ?? NO_LOCATIONS}
        onChange={(locations) => patch({ locations })}
        multiRegion={false}
        originLabel={t("labels.jobCreate.pinLocationToMap")}
      />
      {entityId && (
        // A job's video screening has its own owner-only builder (#1918).
        <div>
          <p className="mb-3 text-xs text-muted-foreground">{t("studio.editorV2.screeningHint")}</p>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => navigate(`${publicJobPath(entityId)}/screening`)}
          >
            <ClipboardCheck className="mr-1.5 h-4 w-4" />
            {t("studio.editorV2.screeningSetup")}
          </Button>
        </div>
      )}
    </div>
  );
}
