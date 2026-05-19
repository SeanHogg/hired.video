/**
 * CreatorTemplatesPanel — slide-out side panel listing the templates the
 * current user has published to the marketplace, with edit + republish +
 * archive actions inline. Lives inside the studio (Sheet on the right
 * edge) so users don't have to leave their workspace to manage their
 * catalog. Backend already exists at GET /api/studio/templates/me — this
 * is the missing UI surface.
 *
 * Self-gates the action menu items based on each template's visibility
 * (private / unlisted / public): "Republish to public" only renders for
 * non-public rows; "Make private" only for non-private rows. Following
 * the DRY rule, the row decides its own affordances rather than the
 * parent computing canX booleans for every consumer.
 */

import { useEffect, useState } from "react";
import { Loader2, Eye, EyeOff, Globe, Trash2, Edit3, ExternalLink, Store, ImagePlus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  studioTemplatesService,
  type StudioTemplate,
} from "@/lib/services/studio-templates-service";
import MediaPicker from "@/components/shared/MediaPicker";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user clicks "Edit" on a template. The studio loads
   *  the source project (or, if missing, applies the template script to
   *  the current draft) so the user can iterate inside the studio. */
  onEditTemplate?: (template: StudioTemplate) => void;
}

const VISIBILITY_BADGE: Record<StudioTemplate["visibility"], { label: string; className: string }> = {
  public:   { label: "Public",   className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  unlisted: { label: "Unlisted", className: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  private:  { label: "Private",  className: "bg-muted text-muted-foreground border-border" },
};

function formatPrice(cents: number, currency: string): string {
  if (cents === 0) return "Free";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default function CreatorTemplatesPanel({ open, onOpenChange, onEditTemplate }: Props) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<StudioTemplate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Reload on open so a template the user just published from
  // PublishAsTemplateDialog appears without a manual refresh.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    studioTemplatesService.listMine()
      .then(setTemplates)
      .catch((e) => toast({ title: "Couldn't load templates", description: String(e), variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open, toast]);

  async function changeVisibility(t: StudioTemplate, visibility: StudioTemplate["visibility"]) {
    setBusyId(t.id);
    try {
      // Public republish requires creator-consent — the backend rejects
      // the patch without `consentAccepted: true`, so set it. Private/
      // unlisted toggles don't need it.
      const updated = await studioTemplatesService.update(t.id, {
        visibility,
        ...(visibility === "public" ? { consentAccepted: true } : {}),
      });
      setTemplates((prev) => (prev ?? []).map((row) => (row.id === t.id ? updated : row)));
      toast({ title: visibility === "public" ? "Republished" : `Set to ${visibility}` });
    } catch (e) {
      toast({ title: "Update failed", description: String(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function changeThumbnail(t: StudioTemplate, url: string) {
    setBusyId(t.id);
    try {
      const updated = await studioTemplatesService.update(t.id, { thumbnailUrl: url });
      setTemplates((prev) => (prev ?? []).map((row) => (row.id === t.id ? updated : row)));
      toast({ title: "Thumbnail updated" });
    } catch (e) {
      toast({ title: "Update failed", description: String(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function archive(t: StudioTemplate) {
    if (!window.confirm(`Delete "${t.name}"? This removes it from the marketplace permanently.`)) return;
    setBusyId(t.id);
    try {
      await studioTemplatesService.deleteById(t.id);
      setTemplates((prev) => (prev ?? []).filter((row) => row.id !== t.id));
      toast({ title: "Removed", description: `"${t.name}" was deleted.` });
    } catch (e) {
      toast({ title: "Delete failed", description: String(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  const isEmpty = !loading && templates !== null && templates.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Store className="w-4 h-4 text-primary" />
            My published templates
          </SheetTitle>
          <SheetDescription>
            Templates you've published to the hired.video marketplace. Edit, republish, or remove them here.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-2">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          )}

          {isEmpty && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              You haven't published any templates yet.
              <br />
              Use <span className="font-medium text-foreground">More → Publish as Marketplace Template</span> on a project to share one.
            </div>
          )}

          {!loading && (templates ?? []).map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              busy={busyId === t.id}
              onEdit={onEditTemplate ? () => onEditTemplate(t) : undefined}
              onChangeVisibility={(v) => changeVisibility(t, v)}
              onChangeThumbnail={(url) => changeThumbnail(t, url)}
              onArchive={() => archive(t)}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface RowProps {
  template: StudioTemplate;
  busy: boolean;
  onEdit?: () => void;
  onChangeVisibility: (v: StudioTemplate["visibility"]) => void;
  onChangeThumbnail: (url: string) => void;
  onArchive: () => void;
}

/**
 * Self-contained row: owns its own visibility-action affordances. Parent
 * passes a single onChangeVisibility callback and the row decides which
 * actions to render based on the template's current state — no upstream
 * canRepublish / canMakePrivate boolean drilling.
 */
function TemplateRow({ template: t, busy, onEdit, onChangeVisibility, onChangeThumbnail, onArchive }: RowProps) {
  const badge = VISIBILITY_BADGE[t.visibility];
  const listingUrl = t.listingSlug
    ? `/marketplace/templates/${t.listingSlug}`
    : `/marketplace/templates/${t.id}`;

  // The thumbnail tile itself is the picker trigger — click to upload /
  // change. Routes through MediaPicker so creators get upload + stock + AI
  // image without each surface rolling its own file input (DRY rule).
  const thumbnailTrigger = (
    <button
      type="button"
      disabled={busy}
      className="group relative w-16 h-16 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center border border-transparent hover:border-primary/40 transition-colors"
      title={t.thumbnailUrl ? "Change thumbnail" : "Add thumbnail"}
    >
      {t.thumbnailUrl ? (
        <>
          <img
            src={t.thumbnailUrl}
            alt={t.name}
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
          />
          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-medium">
            Change
          </span>
        </>
      ) : (
        <span className="flex flex-col items-center gap-0.5 text-muted-foreground group-hover:text-foreground">
          <ImagePlus className="w-4 h-4" />
          <span className="text-[9px]">Add</span>
        </span>
      )}
    </button>
  );

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden flex flex-col">
      <div className="flex items-start gap-3 p-3">
        <MediaPicker
          accept="image"
          title="Choose template thumbnail"
          trigger={thumbnailTrigger}
          onPick={(asset) => onChangeThumbnail(asset.url)}
          disabled={busy}
        />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-medium leading-tight truncate">{t.name}</h3>
            <Badge variant="outline" className={`text-[10px] shrink-0 ${badge.className}`}>
              {badge.label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground">{formatPrice(t.priceCents, t.currency)}</span>
            <span className="flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" />{t.viewCount}</span>
            <span>{t.purchaseCount} sold</span>
          </div>
          {t.description && (
            <p className="text-[11px] text-muted-foreground line-clamp-2">{t.description}</p>
          )}
        </div>
      </div>

      {/* Actions row — the row decides what to show based on visibility. */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-t bg-muted/20">
        {onEdit && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] px-2"
            disabled={busy}
            onClick={onEdit}
            title="Open this template in the studio"
          >
            <Edit3 className="w-3 h-3 mr-1" /> Edit
          </Button>
        )}

        {t.visibility !== "public" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] px-2"
            disabled={busy}
            onClick={() => onChangeVisibility("public")}
          >
            <Globe className="w-3 h-3 mr-1" /> Republish
          </Button>
        )}
        {t.visibility !== "private" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] px-2"
            disabled={busy}
            onClick={() => onChangeVisibility("private")}
            title="Hide from marketplace listings"
          >
            <EyeOff className="w-3 h-3 mr-1" /> Make private
          </Button>
        )}

        {t.visibility === "public" && (
          <a
            href={listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 h-7"
            title="Open the public listing"
          >
            <ExternalLink className="w-3 h-3 mr-1" /> View listing
          </a>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[11px] px-2 ml-auto text-destructive hover:text-destructive"
          disabled={busy}
          onClick={onArchive}
          title="Delete this template permanently"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
