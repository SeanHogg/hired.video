import ResumeCard from "@/components/ResumeCard";
import AddToListMenu from "@/components/lists/AddToListMenu";
import type { ResumeWithOwnership } from "@/types/resume";
import type { ResumeActions } from "./use-resume-actions";
import type { ResumeDialogState } from "./use-resume-dialog-state";

interface OwnedResumeCardProps {
  resume: ResumeWithOwnership;
  parentName?: string;
  variations?: ResumeWithOwnership[];
  actions: ResumeActions;
  dialogs: ResumeDialogState;
}

/**
 * One card definition shared by the Scroll and Grid views so the full
 * handler wiring lives in a single place (Table renders its own dense rows).
 */
export default function OwnedResumeCard({
  resume,
  parentName,
  variations,
  actions,
  dialogs,
}: OwnedResumeCardProps) {
  const ref = { id: resume.id, title: resume.title };
  return (
    <ResumeCard
      id={resume.id}
      slug={resume.slug}
      userId={resume.userId}
      name={resume.title}
      title={resume.title}
      summary={resume.summary}
      createdAt={resume.createdAt}
      views={resume.viewCount}
      scores={resume.scores}
      sentimentScore={resume.sentimentScore}
      privacy={resume.privacy}
      isMaster={resume.isMaster}
      isActive={resume.isActive}
      parentId={resume.parentId}
      parentName={parentName}
      diffPercent={resume.diffPercent}
      variations={variations}
      ownership={resume.ownership}
      onView={() => actions.handleResumeView(resume.id)}
      onEdit={() => actions.handleEdit(resume.id)}
      onRename={() => dialogs.setRenameDialog({ open: true, target: resume })}
      onAddMedia={() => actions.handleAddMedia(resume)}
      onCreateVariation={() => actions.handleCreateVariation(resume.id)}
      onSetActive={() => actions.handleSetActiveResume(resume.id)}
      onShare={() => actions.handleShare(resume)}
      onCopyLink={() => actions.handleCopyLink(resume)}
      onShowQR={() => dialogs.setQrDialog({ open: true, target: resume })}
      onDownload={(format) => actions.handleDownload(resume, format)}
      onChangePrivacy={(p) => actions.handleChangePrivacy(resume.id, p)}
      onPromoteToMaster={() => actions.handlePromoteToMaster(resume.id)}
      onCopyToMaster={resume.parentId ? () => actions.handleCopyToMaster(resume) : undefined}
      onDelete={() => actions.requestDelete(resume)}
      isArchived={!!resume.archivedAt}
      onArchive={() => actions.handleArchive(resume.id)}
      onUnarchive={() => actions.handleUnarchive(resume.id)}
      onViewVersionHistory={() => dialogs.setVersionHistoryFor(ref)}
      onViewToolHistory={() => dialogs.openToolHistory(ref)}
      onScoreClick={(toolIds) => dialogs.openToolHistory(ref, toolIds)}
      onViewAnalytics={() => dialogs.setAnalyticsDialog({ open: true, target: resume })}
      extraMenuItems={
        <AddToListMenu
          entityType="resume"
          entityId={resume.id}
          entityLabel={resume.title}
        />
      }
    />
  );
}
