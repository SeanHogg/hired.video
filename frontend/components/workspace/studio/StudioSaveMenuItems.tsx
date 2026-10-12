/**
 * StudioSaveMenuItems — a studio format's own rows in the workspace ⋯ (they
 * used to be the Save split-button's dropdown): Save now, where it is
 * published (with Re-publish), Export (the kind's verb), the share / editor
 * links, the kind's publish destinations, and the project's template /
 * clone / delete rows. Rows self-gate: a kind with no destinations shows no
 * Publish group; an unsaved draft greys its links. Rendered INSIDE a
 * DropdownMenuContent (WorkspaceMoreMenu's children).
 */
import { useState, type ComponentType, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { publicVideoPath } from "@shared/public-paths";
import { useTranslation } from "react-i18next";
import { Check, Copy, Download, Loader2, Save } from "lucide-react";
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import PublishedToList from "@/components/studio/v2/PublishedToList";
import { destinationIcon } from "@/lib/studio/publish-destination-meta";
import { useSocialPublishEntitlement } from "@/lib/hooks/useSocialPublishEntitlement";
import { useToast } from "@/hooks/use-toast";
import type { StudioPublication } from "@/lib/services/studio-service";
import { MEDIA_KIND_UI, publishDestinationsFor, type MediaKind, type PublishDestinationId } from "@shared/media-kinds";
import { isManualUploadDestination } from "@shared/manual-upload";

const GROUP = "text-[10px] uppercase tracking-widest text-muted-foreground";

export interface StudioSaveMenuItemsProps {
  saving: boolean;
  onSave: () => void;
  hasContent: boolean;
  mediaKind: MediaKind;
  projectId: string | null;
  slug?: string | null;
  hasVideo: boolean;
  isPublishedToProfile?: boolean;
  onExport: () => void;
  exporting: boolean;
  /** Keyed by destination; an unbound destination shows "soon". */
  publishHandlers?: Partial<Record<PublishDestinationId, () => void>>;
  publications?: StudioPublication[];
  onRepublish?: (destination: string) => void;
  republishing?: string | null;
  /** Extra rows for the kind (e.g. Export to Roblox). */
  kindItems?: ReactNode;
  /** useProjectChrome().items — templates, clone, delete. */
  projectItems?: ReactNode;
}

export default function StudioSaveMenuItems({
  saving,
  onSave,
  hasContent,
  mediaKind,
  projectId,
  slug,
  hasVideo,
  isPublishedToProfile = false,
  onExport,
  exporting,
  publishHandlers,
  publications,
  onRepublish,
  republishing,
  kindItems,
  projectItems,
}: StudioSaveMenuItemsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [copied, setCopied] = useState<"editor" | "share" | null>(null);
  const ui = MEDIA_KIND_UI[mediaKind];
  // Social networks appear once the server offers them (self-gating seam).
  const { offers } = useSocialPublishEntitlement();
  const destinations = publishDestinationsFor(mediaKind).filter((d) => offers(d.id));
  const busy = saving || exporting;
  const navigate = useNavigate();
  /** A destination that forbids direct posting (Webtoon, Tapas) opens its
   *  manual-upload card in the Distribution Hub (#2048). */
  const handlerFor = (id: PublishDestinationId): (() => void) | undefined =>
    publishHandlers?.[id] ??
    (isManualUploadDestination(id) && projectId
      ? () => navigate(`/studio/distribution?project=${encodeURIComponent(projectId)}&manual=${encodeURIComponent(id)}`)
      : undefined);

  async function copyTo(kind: "editor" | "share") {
    if (!projectId) return;
    const url =
      kind === "share"
        ? `${window.location.origin}/v/${encodeURIComponent(slug || projectId)}`
        : `${window.location.origin}/studio/${encodeURIComponent(projectId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(kind);
      toast({ title: kind === "share" ? t("studio.saveMenu.shareLinkCopied") : t("studio.saveMenu.editorLinkCopied") });
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast({ title: t("studio.saveMenu.copyFailed"), variant: "destructive" });
    }
  }

  const copyIcon = (kind: "editor" | "share") =>
    copied === kind ? <Check className="mr-2 h-3.5 w-3.5 text-brand-green-text" /> : <Copy className="mr-2 h-3.5 w-3.5" />;

  return (
    <>
      <DropdownMenuItem onSelect={onSave} disabled={busy || !hasContent}>
        {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
        {t("workspace.more.saveNow")}
      </DropdownMenuItem>

      {publications && publications.some((p) => p.status === "published") && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className={GROUP}>{t("studio.saveMenu.publishedTo")}</DropdownMenuLabel>
          <div className="px-1 pb-1">
            <PublishedToList publications={publications} variant="compact" onRepublish={onRepublish} republishing={republishing} />
          </div>
        </>
      )}

      <DropdownMenuSeparator />
      <DropdownMenuLabel className={GROUP}>{t("studio.saveMenu.export")}</DropdownMenuLabel>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          onExport();
        }}
        disabled={exporting || !hasContent}
        title={hasContent ? t("studio.saveMenu.exportTitle", { kind: ui.badgeLabel.toLowerCase() }) : t("studio.saveMenu.exportEmptyTitle")}
      >
        {exporting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-2 h-3.5 w-3.5" />}
        {exporting ? t("studio.saveMenu.exporting") : ui.exportVerb}
      </DropdownMenuItem>
      {kindItems}

      <DropdownMenuSeparator />
      <DropdownMenuLabel className={GROUP}>{t("studio.saveMenu.share")}</DropdownMenuLabel>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          void copyTo("share");
        }}
        disabled={!projectId}
        title={!projectId ? t("studio.saveMenu.saveFirstTooltip") : publicVideoPath(slug || projectId)}
      >
        {copyIcon("share")}
        {projectId ? t("studio.saveMenu.copyShareLink") : t("studio.saveMenu.saveFirstForLink")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          void copyTo("editor");
        }}
        disabled={!projectId}
        title={!projectId ? t("studio.saveMenu.saveFirstTooltip") : undefined}
      >
        {copyIcon("editor")}
        {t("studio.saveMenu.copyEditorLink")}
      </DropdownMenuItem>

      {destinations.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className={GROUP}>{t("studio.saveMenu.publish")}</DropdownMenuLabel>
          <p className="px-2 pb-1.5 text-[10px] leading-tight text-muted-foreground">
            {hasVideo
              ? t("studio.saveMenu.publishHintRendered", { kind: ui.badgeLabel.toLowerCase() })
              : t("studio.saveMenu.publishHintRender")}
          </p>
          {destinations.map((dest) => (
            <PublishItem
              key={dest.id}
              icon={destinationIcon(dest.id)}
              label={
                dest.id === "profile"
                  ? isPublishedToProfile
                    ? t("studio.saveMenu.removeFromProfile")
                    : t("studio.saveMenu.publishToProfile")
                  : t("studio.saveMenu.publishToDestination", { dest: dest.label })
              }
              onClick={handlerFor(dest.id)}
              hasVideo={hasVideo}
            />
          ))}
        </>
      )}

      {projectItems && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className={GROUP}>{t("studio.saveMenu.more")}</DropdownMenuLabel>
          {projectItems}
        </>
      )}
    </>
  );
}

function PublishItem({
  icon: Icon,
  label,
  onClick,
  hasVideo,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: (() => void) | undefined;
  hasVideo: boolean;
}) {
  const { t } = useTranslation();
  const disabled = !onClick;
  return (
    <DropdownMenuItem
      onSelect={onClick}
      disabled={disabled}
      title={disabled ? t("studio.saveMenu.publishSoonTooltip") : !hasVideo ? t("studio.saveMenu.publishWillRenderTooltip") : undefined}
    >
      <Icon className="mr-2 h-3.5 w-3.5" />
      {label}
      {disabled && <span className="ml-auto text-[10px] text-muted-foreground">{t("studio.saveMenu.soon")}</span>}
    </DropdownMenuItem>
  );
}
