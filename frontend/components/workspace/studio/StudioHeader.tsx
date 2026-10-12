/**
 * StudioHeader — the workspace header for a studio format (video, podcast,
 * voice, animation, comic, image, game, CAD, document): the editable title,
 * collaborators, the autosave status, the kind's ONE Undo / Redo, Preview
 * (the kind's own: preview overlay, document preview, Playtest, Play),
 * Simple | Advanced, ⋯ and Post.
 *
 *   ⋯  Details · Save as course lesson · Versions (résumé documents) ·
 *      the format's own rows (Save now, published-to, Export, share links,
 *      publish destinations, templates / clone / delete) ·
 *      Advanced: Embed (SuperAdmin) · Invite (3D worlds) ·
 *      Set as my pitch (owner's video pitch projects; self-gating)
 */
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import CollabPresenceBar from "@/components/studio/v2/CollabPresenceBar";
import WorkspaceSaveStatus from "../WorkspaceSaveStatus";
import { useProjectChrome } from "@/components/studio/shared/ProjectChromeMenu";
import ProjectDetailsSheet from "@/components/studio/shared/ProjectDetailsSheet";
import type { StudioProject, StudioPublication } from "@/lib/services/studio-service";
import type { AutosaveStatus } from "@/lib/studio/editor-v2/use-server-autosave";
import type { CollabPeer } from "@/lib/studio/collab/use-studio-room";
import type { HistoryControls } from "@/lib/workspace/use-undo-shortcuts";
import type { WorkspaceDepthControls } from "@/lib/workspace/use-workspace-depth";
import WorkspaceHeader, { type HeaderPost, type HeaderPreview } from "../WorkspaceHeader";
import StudioSaveMenuItems, { type StudioSaveMenuItemsProps } from "./StudioSaveMenuItems";
import SetAsPitchControl from "@/components/pitch/SetAsPitchControl";

const ReviewCommentsDialog = lazy(() => import("@/components/studio/ReviewCommentsDialog"));

interface StudioHeaderProps {
  title: string;
  onTitleChange: (next: string) => void;
  autosaveStatus: AutosaveStatus;
  collab: { connected: boolean; peers: CollabPeer[] };
  history: HistoryControls;
  preview: HeaderPreview | null;
  depth: WorkspaceDepthControls;
  project: StudioProject | null;
  onProjectChange: (next: StudioProject) => void;
  /** The format's own ⋯ rows (export, share, publish). */
  saveMenu: Omit<StudioSaveMenuItemsProps, "projectItems">;
  /** Publication history for the Details drawer. */
  publications: StudioPublication[];
  onRefreshPublications: () => void;
  getVideoScript: () => unknown;
  captureCurrentFrame?: () => Promise<string | null>;
  onCourseLesson: (() => void) | null;
  onVersions: (() => void) | null;
  onEmbed: (() => void) | null;
  onInvite: (() => void) | null;
  post: HeaderPost | null;
}

export default function StudioHeader(props: StudioHeaderProps) {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const { project, saveMenu } = props;
  // Clone / delete / publish-as-template rows, inside ⋯.
  const chrome = useProjectChrome({
    project,
    getVideoScript: props.getVideoScript,
    captureCurrentFrame: props.captureCurrentFrame,
  });

  return (
    <WorkspaceHeader
      surface="studio"
      backHref="/studio"
      title={
        <div className="group relative flex min-w-0 items-center">
          <Input
            value={props.title}
            onChange={(e) => props.onTitleChange(e.target.value)}
            aria-label={t("studio.focus.projectTitle")}
            className="h-9 min-w-0 max-w-[40vw] border-transparent bg-transparent px-1.5 pr-7 text-sm font-semibold shadow-none hover:border-border focus-visible:border-border sm:max-w-xs"
          />
          <Pencil
            className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-0"
            aria-hidden="true"
          />
        </div>
      }
      presence={<CollabPresenceBar connected={props.collab.connected} peers={props.collab.peers} />}
      // A manual save in flight reads "Saving…" too, so the status never
      // contradicts the Save button's own spinner.
      saveStatus={<WorkspaceSaveStatus status={saveMenu.saving ? "saving" : props.autosaveStatus} />}
      history={props.history}
      preview={props.preview}
      depth={props.depth}
      moreActions={{
        details: project ? { onSelect: () => setDetailsOpen(true) } : null,
        saveAs: props.onCourseLesson ? { onSelect: props.onCourseLesson, label: t("workspace.more.saveAsLesson") } : null,
        versions: props.onVersions ? { onSelect: props.onVersions } : null,
        embed: props.onEmbed ? { onSelect: props.onEmbed } : null,
        // Advanced ⋯: time-coded review comments + share-for-review links.
        reviewing: project ? { onSelect: () => setReviewOpen(true) } : null,
        invite: props.onInvite ? { onSelect: props.onInvite } : null,
      }}
      moreChildren={
        <>
          <SetAsPitchControl project={project} />
          <StudioSaveMenuItems {...saveMenu} projectItems={chrome.items} />
        </>
      }
      moreDialogs={
        <>
          {chrome.dialogs}
          {project && reviewOpen && (
            <Suspense fallback={null}>
              <ReviewCommentsDialog projectId={project.id} open onOpenChange={setReviewOpen} />
            </Suspense>
          )}
          {project && (
            <ProjectDetailsSheet
              project={project}
              onChange={props.onProjectChange}
              noTrigger
              open={detailsOpen}
              onOpenChange={setDetailsOpen}
              publications={props.publications}
              onRepublish={saveMenu.onRepublish}
              republishing={saveMenu.republishing}
              onRefreshPublications={props.onRefreshPublications}
            />
          )}
        </>
      }
      post={props.post}
    />
  );
}
