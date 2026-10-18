import type * as React from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import EntityHubTabStrip from "@/components/EntityHubTabStrip";
import ResumeViewer from "@/components/ResumeViewer";
import { Button } from "@/components/ui/button";
import { APP_PAGE_COLUMN } from "@/lib/ui/page-layout";
import type { Resume } from "@/types/resume";

interface ResumesViewerViewProps {
  selectedResume: Resume | null;
  successAlert: React.ReactNode;
  dialogs: React.ReactNode;
  onBack: () => void;
  onUpdate: () => void;
  onCreateVariation: (resumeId: string) => void;
}

/**
 * Viewer mode (/resumes/:id) takes over the page. The legacy in-page
 * "builder" was removed — resume create/edit live in the Studio document
 * canvas now (#1915).
 */
export default function ResumesViewerView({
  selectedResume,
  successAlert,
  dialogs,
  onBack,
  onUpdate,
  onCreateVariation,
}: ResumesViewerViewProps) {
  const { t } = useTranslation();
  return (
    <AppShell bgClassName="bg-background">
      <div className={APP_PAGE_COLUMN}>
        <div>
          {/* Keep the hub-level tab strip visible in viewer mode — the user
              is still "inside" the Resumes section. */}
          <EntityHubTabStrip entity="resume" />
          {successAlert}
          {selectedResume && (
            <div className="space-y-4 sm:space-y-6">
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={onBack}
                  className="min-h-[44px]"
                >
                  {t("actions.backToResumesArrow")}
                </Button>
              </div>
              <ResumeViewer
                resume={selectedResume}
                onUpdate={onUpdate}
                onCreateVariation={onCreateVariation}
                canEdit
              />
            </div>
          )}
        </div>
      </div>
      {dialogs}
    </AppShell>
  );
}
