/**
 * NewVideoSplitButton — the split-button "+ New {kind} [▼]" affordance
 * for the Studio landing. Main click creates a draft with the user's
 * last-used template; the chevron reveals every template in the catalog
 * grouped by mediaKind so the user can switch starter in one click.
 *
 * Save / navigate / "last-used template" persistence all live in the
 * shared `useCreateStudioDraft` hook so this component is just chrome
 * over that primitive — every "start a new video" path routes through
 * the same hook (DRY).
 *
 * The main-button verb adapts automatically because it reads
 * `template.label` ("New Podcast episode", "New Sizzle Reel", …). The
 * dropdown is a MEGA MENU: every mediaKind becomes its own labelled
 * column laid out in a multi-column masonry so the user sees all ~40
 * starters at a glance instead of scrolling a single 17+-entry list.
 * Columns render in `KIND_DISPLAY_ORDER` — Video then Document lead, the
 * remaining kinds follow in catalog order. Section columns self-hide
 * when the catalog has zero templates of that kind, so adding a future
 * voice / cad template lights up its column automatically with no
 * further wiring.
 */
import { Check, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TEMPLATE_CATALOG,
  type ContentTemplate,
  type TemplateDef,
} from "@/components/studio/templates/catalog";
import { useCreateStudioDraft } from "@/lib/studio/use-create-studio-draft";
import { cn } from "@/lib/utils";
import {
  MEDIA_KINDS,
  MEDIA_KIND_UI,
  type MediaKind,
} from "@shared/media-kinds";

/**
 * Order the mega-menu columns render in. Video then Document lead (the two
 * most-used starters); every other kind follows in `MEDIA_KINDS` order. We
 * derive the tail from the SSoT rather than hand-listing it so a newly added
 * mediaKind appears automatically — it just lands after Document instead of
 * needing a manual entry here.
 */
const KIND_DISPLAY_ORDER: MediaKind[] = [
  "video",
  "document",
  ...MEDIA_KINDS.filter((k) => k !== "video" && k !== "document"),
];

interface NewVideoSplitButtonProps {
  /** Visual variant — "outline" for the editor toolbar; "primary" for
   *  the landing CTA. */
  variant?: "outline" | "primary";
  /** Optional class for the wrapping div. */
  className?: string;
}

export default function NewVideoSplitButton({
  variant = "outline",
  className,
}: NewVideoSplitButtonProps) {
  const { create, creating, defaultTemplate } = useCreateStudioDraft();

  function startNewWithTemplate(id: ContentTemplate) {
    void create({ kind: "template", templateId: id });
  }

  // Verb adapts via the template's own label, which already carries the
  // kind context: "New Podcast episode", "New Sizzle Reel", "New Self-
  // tape audition". `MEDIA_KIND_UI[kind].badgeLabel` is the fallback
  // when the persisted defaultTemplate id is missing from the catalog
  // (legacy localStorage value, deleted template) — keeps the verb
  // recognisable instead of dropping to a generic "Video".
  const defaultTemplateDef = TEMPLATE_CATALOG.find((t) => t.id === defaultTemplate);
  const fallbackLabel = MEDIA_KIND_UI[defaultTemplateDef?.mediaKind ?? "video"].badgeLabel;
  const mainLabel = creating
    ? "Creating…"
    : `New ${defaultTemplateDef?.label ?? fallbackLabel}`;
  const buttonVariant = variant === "primary" ? "default" : "outline";

  return (
    <div className={cn("flex", className)}>
      <Button
        type="button"
        size="sm"
        variant={buttonVariant}
        disabled={creating}
        onClick={() => startNewWithTemplate(defaultTemplate)}
        className="rounded-r-none border-r-0 gap-1"
        title={mainLabel}
      >
        <Plus className="h-4 w-4" />
        {mainLabel}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={buttonVariant}
            disabled={creating}
            className="rounded-l-none px-1.5"
            title="Choose a template"
            aria-label="Choose a template"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="max-h-[70vh] w-[92vw] max-w-3xl overflow-y-auto p-3"
        >
          {/* Multi-column masonry — each kind is a self-contained block that
              never splits across columns (break-inside-avoid). Video leads
              and, being the largest set, naturally anchors the first column;
              the shorter kinds pack in around it. */}
          <div className="columns-2 gap-4 md:columns-3 [&>*]:break-inside-avoid">
            {KIND_DISPLAY_ORDER.map((kind) => (
              <KindSection
                key={kind}
                kind={kind}
                defaultTemplate={defaultTemplate}
                onPick={startNewWithTemplate}
              />
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * One MediaKind column inside the mega menu. Self-hides when the catalog
 * has zero templates of this kind — no caller-passed `hasPodcastTemplates`
 * boolean. Header label reads from MEDIA_KIND_UI so a rename ripples once.
 * The wrapping block carries `break-inside-avoid` (applied by the parent
 * masonry container) so a column header is never orphaned from its items.
 */
function KindSection({
  kind,
  defaultTemplate,
  onPick,
}: {
  kind: MediaKind;
  defaultTemplate: ContentTemplate;
  onPick: (id: ContentTemplate) => void;
}) {
  const items: TemplateDef[] = TEMPLATE_CATALOG.filter((t) => t.mediaKind === kind);
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <DropdownMenuLabel className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {MEDIA_KIND_UI[kind].badgeLabel}
      </DropdownMenuLabel>
      {items.map((t) => {
        const Icon = t.icon;
        const isDefault = defaultTemplate === t.id;
        return (
          <DropdownMenuItem
            key={t.id}
            onClick={() => onPick(t.id)}
            className="cursor-pointer"
          >
            <Icon className="mr-2 h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{t.label}</span>
            {isDefault && (
              <Check className="ml-2 h-3 w-3 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        );
      })}
    </div>
  );
}
