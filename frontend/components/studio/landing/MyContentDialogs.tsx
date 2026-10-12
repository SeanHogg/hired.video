import ProjectDetailsSheet from "@/components/studio/shared/ProjectDetailsSheet";
import DeleteProjectConfirm from "@/components/studio/shared/DeleteProjectConfirm";
import type { MyContentDialogState } from "@/lib/studio/landing/use-my-content";

/**
 * The single details drawer + delete confirm shared by every "My content"
 * card — mounted once at the page root (cards flip `detailsProject` /
 * `deletingProject` to open them) so a long grid doesn't mount N dialogs.
 */
export default function MyContentDialogs({ content }: { content: MyContentDialogState }) {
  const {
    detailsProject,
    setDetailsProject,
    deletingProject,
    setDeletingProject,
    patchProject,
    removeProjects,
  } = content;
  return (
    <>
      <ProjectDetailsSheet
        noTrigger
        open={detailsProject !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsProject(null);
        }}
        project={detailsProject}
        onChange={patchProject}
      />
      <DeleteProjectConfirm
        open={deletingProject !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingProject(null);
        }}
        projects={deletingProject ? [deletingProject] : []}
        onDeleted={removeProjects}
      />
    </>
  );
}
