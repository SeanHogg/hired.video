import type * as React from "react";
import { useTranslation } from "react-i18next";
import ResumeEmptyDropzone from "@/components/ResumeEmptyDropzone";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import Pagination from "@/components/Pagination";
import type { SearchFilters } from "@/components/SearchBar";
import type { ViewMode } from "@/lib/hooks/useViewMode";
import type { ResumeWithOwnership } from "@/types/resume";
import OwnedResumeCard from "./OwnedResumeCard";
import ResumeOwnedTable from "./ResumeOwnedTable";
import type { ResumeActions } from "./use-resume-actions";
import type { ResumeDialogState } from "./use-resume-dialog-state";

/** Studio template that seeds a new resume document (#1912/#1915). */
export const CREATE_RESUME_PATH = "/studio?contentTemplate=resume-doc";

interface ResumesMineBodyProps {
  successAlert: React.ReactNode;
  loading: boolean;
  ownedCount: number;
  viewMode: ViewMode;
  resumes: ResumeWithOwnership[];
  childrenByParentId: Map<string, ResumeWithOwnership[]>;
  resumeNameById: Map<string, string>;
  searchFilters: SearchFilters;
  pagination: {
    currentPage: number;
    itemsPerPage: number;
    setCurrentPage: (page: number) => void;
    handleItemsPerPageChange: (itemsPerPage: number) => void;
  };
  actions: ResumeActions;
  dialogs: ResumeDialogState;
  onCreateResume: () => void;
}

/** Body of the "My resumes" tab — loading / table / scroll / grid / empty. */
export default function ResumesMineBody({
  successAlert,
  loading,
  ownedCount,
  viewMode,
  resumes,
  childrenByParentId,
  resumeNameById,
  searchFilters,
  pagination,
  actions,
  dialogs,
  onCreateResume,
}: ResumesMineBodyProps) {
  const { t } = useTranslation();
  const renderCard = (resume: ResumeWithOwnership) => (
    <OwnedResumeCard
      key={resume.id}
      resume={resume}
      parentName={resume.parentId ? resumeNameById.get(resume.parentId) : undefined}
      variations={childrenByParentId.get(resume.id)}
      actions={actions}
      dialogs={dialogs}
    />
  );
  const hasFilters = !!searchFilters.search || Object.keys(searchFilters).length > 0;

  return (
    <div className="space-y-6">
      {successAlert}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground mt-4">{t("messages.resumes.loading")}</p>
        </div>
      ) : ownedCount > 0 ? (
        <>
          <div className="space-y-8">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-muted-foreground">
                  {t("labels.resumes.count", { count: ownedCount })}
                </div>
              </div>
              {viewMode === "table" ? (
                <ResumeOwnedTable
                  resumes={resumes}
                  onView={actions.handleResumeView}
                  onEdit={actions.handleEdit}
                  onDelete={actions.requestDelete}
                />
              ) : viewMode === "scroll" ? (
                <HorizontalScroller itemCount={resumes.length}>
                  {resumes.map(renderCard)}
                </HorizontalScroller>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {resumes.map(renderCard)}
                </div>
              )}
            </div>
          </div>
          <Pagination
            currentPage={pagination.currentPage}
            totalItems={ownedCount}
            itemsPerPage={pagination.itemsPerPage}
            onPageChange={pagination.setCurrentPage}
            onItemsPerPageChange={pagination.handleItemsPerPageChange}
          />
        </>
      ) : (
        <ResumeEmptyDropzone
          title={hasFilters ? t("headings.resumes.noMatching") : t("headings.resumes.noneYet")}
          description={
            hasFilters
              ? t("messages.resumes.noMatchingDesc")
              : t("messages.resumes.emptyDropzoneDesc")
          }
          onUploadSuccess={actions.handleUploadSuccess}
          onCreateResume={onCreateResume}
        />
      )}
    </div>
  );
}
