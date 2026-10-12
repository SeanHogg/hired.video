/**
 * WorkspaceHeader — the frame's ONE header, identical for every document
 * and in both depths, in a fixed order:
 *
 *   ← · title · (presence) · Saved ········ Undo · Redo · Preview · Simple|Advanced · ⋯ · (Post)
 *
 * Post shows only for studio formats: a kit posts from its stepper's last
 * step, never both (the header ignores `post` on a kit). Nothing is added or
 * removed when the depth changes; Advanced's extra actions live inside ⋯.
 * Below the wide layout (the same `lg` the frame switches at) Undo, Redo,
 * Preview and the depth switch fold into ⋯ so the header stays one row.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Eye, Redo2, Send, Undo2 } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useIsWideWorkspace } from "@/hooks/use-media-query";
import type { HistoryControls } from "@/lib/workspace/use-undo-shortcuts";
import type { WorkspaceDepthControls } from "@/lib/workspace/use-workspace-depth";
import { cn } from "@/lib/utils";
import DepthToggle from "./DepthToggle";
import WorkspaceMoreMenu, { type MoreAction } from "./WorkspaceMoreMenu";
import type { MoreItemId, WorkspaceSurface } from "@/lib/workspace/workspace-panels";

export interface HeaderPreview {
  /** Already translated ("Preview", "Playtest", "Stop"…). */
  label: string;
  onClick: () => void;
  pressed?: boolean;
}

export interface HeaderPost {
  label: string;
  onClick: () => void;
  expanded?: boolean;
}

interface WorkspaceHeaderProps {
  surface: WorkspaceSurface;
  backHref: string;
  /** The editable title (a format's own field). */
  title: ReactNode;
  /** Collaborators, by the title. */
  presence?: ReactNode;
  saveStatus: ReactNode;
  /** Null → the buttons stay, disabled (nothing to undo yet). */
  history: HistoryControls | null;
  /** Null → Preview stays, disabled. */
  preview: HeaderPreview | null;
  depth: WorkspaceDepthControls;
  moreActions: Partial<Record<MoreItemId, MoreAction | null>>;
  /** The format's own ⋯ rows (export / share / publish…). */
  moreChildren?: ReactNode;
  moreDialogs?: ReactNode;
  /** Formats without a stepper post from the header. */
  post?: HeaderPost | null;
}

const ICON_BUTTON =
  "flex h-11 w-11 flex-none items-center justify-center rounded-[9px] border border-input bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-card";

export default function WorkspaceHeader({
  surface,
  backHref,
  title,
  presence,
  saveStatus,
  history,
  preview,
  depth,
  moreActions,
  moreChildren,
  moreDialogs,
  post,
}: WorkspaceHeaderProps) {
  const { t } = useTranslation();
  const wide = useIsWideWorkspace();
  const postButton = surface === "studio" ? post : null;
  const backLabel = t("workspace.header.back");
  const previewLabel = preview?.label ?? t("actions.preview");

  const phoneItems = wide ? null : (
    <>
      <DropdownMenuItem disabled={!history?.canUndo} onSelect={() => history?.undo()}>
        <Undo2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
        {t("workspace.header.undo")}
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!history?.canRedo} onSelect={() => history?.redo()}>
        <Redo2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
        {t("workspace.header.redo")}
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!preview} onSelect={() => preview?.onClick()}>
        <Eye className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
        {previewLabel}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => depth.setDepth(depth.advanced ? "simple" : "advanced")}>
        {depth.advanced ? t("workspace.depth.switchToSimple") : t("workspace.depth.switchToAdvanced")}
      </DropdownMenuItem>
    </>
  );

  return (
    <header
      data-region="header"
      className="flex min-h-[52px] flex-none items-center gap-1.5 border-b border-border bg-card px-2 py-1 sm:gap-2 sm:px-3.5"
    >
      <Link
        to={backHref}
        aria-label={backLabel}
        title={backLabel}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-[10px] text-foreground hover:bg-muted"
      >
        <ArrowLeft className="h-[18px] w-[18px]" aria-hidden="true" />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2.5">
        <div className="min-w-0">{title}</div>
        {presence}
        <div className="flex-none">{saveStatus}</div>
      </div>
      <div className="flex flex-none items-center gap-1 sm:gap-1.5">
        {wide && (
          <>
        <button
          type="button"
          onClick={history?.undo}
          disabled={!history?.canUndo}
          aria-label={t("workspace.header.undo")}
          title={t("workspace.header.undo")}
          className={ICON_BUTTON}
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={history?.redo}
          disabled={!history?.canRedo}
          aria-label={t("workspace.header.redo")}
          title={t("workspace.header.redo")}
          className={ICON_BUTTON}
        >
          <Redo2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={preview?.onClick}
          disabled={!preview}
          aria-pressed={preview?.pressed}
          className="inline-flex h-11 flex-none items-center gap-1.5 rounded-[9px] border border-input bg-card px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          {previewLabel}
        </button>
        <DepthToggle depth={depth.depth} onChange={depth.setDepth} />
          </>
        )}
        <WorkspaceMoreMenu
          depth={depth.depth}
          actions={moreActions}
          phoneItems={phoneItems}
          dialogs={moreDialogs}
        >
          {moreChildren}
        </WorkspaceMoreMenu>
        {postButton && (
          <button
            type="button"
            onClick={postButton.onClick}
            aria-expanded={postButton.expanded}
            aria-label={postButton.label}
            title={postButton.label}
            className={cn(
              "inline-flex h-11 min-w-11 flex-none items-center justify-center gap-1.5 rounded-[9px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90",
            )}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{postButton.label}</span>
          </button>
        )}
      </div>
    </header>
  );
}
