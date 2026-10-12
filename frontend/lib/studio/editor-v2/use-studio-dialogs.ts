/**
 * Open state for the editor's modal surfaces — the preview overlays,
 * Save as Course Lesson, the SuperAdmin embed and
 * the 3D-world invite. Lifted out of StudioEditorV2; the dialogs themselves
 * mount in <StudioEditorDialogs>.
 */
import { useState } from "react";

export function useStudioDialogs() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [docPreviewOpen, setDocPreviewOpen] = useState(false);
  // "Save as Course Lesson" — attaches the saved project to a course as
  // sourceType: studio_video. Closes the Studio→Course authoring loop
  // (parity with the Save menu's other publish destinations).
  const [attachToCourseOpen, setAttachToCourseOpen] = useState(false);
  // SuperAdmin page→video embed dialog (#1860).
  const [embedDialogOpen, setEmbedDialogOpen] = useState(false);
  /** 3D-world invite dialog open state — lifted to the editor so the
   *  trigger button can live in the studio header (next to Save +
   *  Playtest) per the existing chrome pattern. The dialog is mounted
   *  once at this level; GameStage3D doesn't carry the affordance. */
  const [gameInviteOpen, setGameInviteOpen] = useState(false);
  return {
    previewOpen,
    setPreviewOpen,
    docPreviewOpen,
    setDocPreviewOpen,
    attachToCourseOpen,
    setAttachToCourseOpen,
    embedDialogOpen,
    setEmbedDialogOpen,
    gameInviteOpen,
    setGameInviteOpen,
  };
}

export type StudioDialogs = ReturnType<typeof useStudioDialogs>;
