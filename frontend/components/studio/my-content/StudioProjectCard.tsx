/**
 * StudioProjectCard — one "My content" card on /studio (scroll + grid
 * views). Hover overlay surfaces Edit / Details / Delete; the title is
 * inline-editable (persists via studioService.saveDraft, optimistic through
 * `onRenamed`). The top-left checkbox drives multi-select for the bulk
 * Delete / Merge bar — it stays visible once the card is selected (or
 * while any selection is active) so the selection is scannable.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Pencil, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { projectVisibilityVisual } from "@/lib/studio/visibility";
import VideoProjectThumbnail from "@/components/studio/shared/VideoProjectThumbnail";
import MediaKindBadge from "@/components/studio/shared/MediaKindBadge";
import { cn } from "@/lib/utils";

export default function StudioProjectCard({
  project,
  onOpen,
  onShowDetails,
  onRenamed,
  onRequestDelete,
  selected,
  selectionActive,
  onSelectedChange,
}: {
  project: StudioProject;
  onOpen: () => void;
  onShowDetails: () => void;
  onRenamed: (next: StudioProject) => void;
  onRequestDelete: () => void;
  selected: boolean;
  /** Any card selected — keeps every checkbox visible during a selection. */
  selectionActive: boolean;
  onSelectedChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [titleDraft, setTitleDraft] = useState(project.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Re-sync local draft if the parent patches the project (e.g. after a
  // SEO save bumps the DTO).
  useEffect(() => {
    if (!editingTitle) setTitleDraft(project.title);
  }, [project.title, editingTitle]);

  // Focus the input when the user opts in (vs autoFocus, which jsx-a11y
  // flags because focus changes that aren't user-initiated reduce screen
  // reader usability).
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  async function commitRename() {
    setEditingTitle(false);
    const next = titleDraft.trim();
    if (!next || next === project.title) {
      setTitleDraft(project.title);
      return;
    }
    setRenaming(true);
    try {
      const res = await studioService.saveDraft({
        projectId: project.id,
        name: next,
      });
      if (res.data) onRenamed(res.data);
    } catch (err) {
      // Keep the user's draft in the input so they can retry without
      // retyping (#663). The toast offers a one-click retry action that
      // re-enters edit mode pinned to the same draft.
      toast({
        title: t("messages.studioLanding.renameFailed"),
        description: err instanceof Error ? err.message : t("errors.unknownErrorAdmin"),
        variant: "destructive",
        action: (
          <ToastAction
            altText={t("labels.studioLanding.retryRenameAlt")}
            onClick={() => {
              setEditingTitle(true);
              queueMicrotask(() => titleInputRef.current?.focus());
            }}
          >
            {t("actions.retry")}
          </ToastAction>
        ),
      });
    } finally {
      setRenaming(false);
    }
  }

  // At-a-glance visibility indicator. Doubles as the details opener so
  // users have a single, always-visible affordance to inspect a video.
  // Visual decision resolved via the shared `projectVisibilityVisual`
  // helper so this surface and `VisibilityChip` stay in lockstep
  // (#673).
  const { Icon: VisibilityIcon } = projectVisibilityVisual(project.isPublic);
  const visibilityLabel = project.isPublic
    ? t("labels.public")
    : t("labels.private");

  return (
    <div
      className={cn(
        "group overflow-hidden rounded-lg border bg-card text-left transition hover:border-brand-primary hover:shadow-md",
        selected ? "border-brand-primary ring-2 ring-brand-primary/40" : "border-border",
      )}
    >
      <div className="relative aspect-video overflow-hidden">
        {/* Multi-select checkbox — top-left. Hidden until hover/focus unless
            a selection is in progress, so the idle grid stays clean. */}
        <div
          className={cn(
            "absolute left-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-md bg-card/90 shadow-md backdrop-blur transition-opacity",
            selected || selectionActive
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          )}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onSelectedChange(v === true)}
            aria-label={t("labels.studioLanding.selectProjectAria", { title: project.title })}
          />
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="block h-full w-full"
          aria-label={t("labels.studioLanding.openProjectAria", { title: project.title })}
        >
          <VideoProjectThumbnail project={project} />
        </button>
        {/* Always-visible visibility badge — top-right of the thumbnail.
            Clicking opens the Details side panel where the visibility
            can be flipped (and SEO + metrics live). */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onShowDetails();
          }}
          title={t("labels.studioLanding.visibilityBadgeTitle", { label: visibilityLabel })}
          aria-label={t("labels.studioLanding.visibilityBadgeAria", { label: visibilityLabel })}
          className={cn(
            "absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold shadow-md backdrop-blur transition",
            project.isPublic
              ? "bg-brand-green text-primary-foreground hover:bg-brand-green/90"
              : "bg-card/90 text-foreground hover:bg-card",
          )}
        >
          <VisibilityIcon className="h-3 w-3" />
          {visibilityLabel}
        </button>
        {/* Kind badge — bottom-left, mirrors the template-card position so
            the chooser + "My content" grid read symmetric. `alwaysShow` so
            EVERY item is typed (including video) per the "each content needs
            a type pill" requirement (#1917). */}
        <MediaKindBadge
          mediaKind={project.mediaKind ?? "video"}
          alwaysShow
          className="absolute bottom-2 left-2 z-10"
        />
        {/* Hover overlay — Edit pill takes the user straight into the
            editor; Details pill opens the side panel. The always-
            visible visibility badge above is also an opener but reads
            as a status indicator first; the Details pill is the
            "manage everything" affordance, so both coexist. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-md hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("actions.edit")}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShowDetails();
            }}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-md hover:bg-muted"
          >
            <Globe className="h-3.5 w-3.5" />
            {t("actions.details")}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete();
            }}
            aria-label={t("labels.studioLanding.deleteProjectAria", { title: project.title })}
            title={t("actions.delete")}
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-card text-destructive shadow-md hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="p-3">
        {editingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                setTitleDraft(project.title);
                setEditingTitle(false);
              }
            }}
            className="block w-full truncate rounded border border-border bg-background px-1.5 py-0.5 text-sm font-medium outline-none focus:border-brand-primary"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingTitle(true)}
            className="flex w-full items-center gap-1.5 text-left"
            aria-label={t("labels.studioLanding.renameProjectAria", { title: project.title })}
          >
            <span className="truncate text-sm font-medium">
              {project.title}
            </span>
            <Pencil
              className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
          </button>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {renaming
            ? t("messages.studioLanding.saving")
            : t("labels.studioLanding.updatedOn", {
                date: new Date(project.updateDateTime).toLocaleDateString(),
              })}
        </p>
      </div>
    </div>
  );
}
