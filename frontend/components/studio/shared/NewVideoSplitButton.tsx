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
 * dropdown groups items by mediaKind so a 17+-entry flat list doesn't
 * make picking a podcast template harder than picking a video one.
 * Section headers self-hide when the catalog has zero templates of that
 * kind — adding a Phase 4 voice template lights up its section
 * automatically with no further wiring.
 */
import { Check, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

export interface NewVideoSplitButtonProps {
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
        <DropdownMenuContent align="end" className="max-h-[60vh] w-60 overflow-y-auto">
          {MEDIA_KINDS.map((kind, kindIndex) => (
            <KindSection
              key={kind}
              kind={kind}
              defaultTemplate={defaultTemplate}
              onPick={startNewWithTemplate}
              showSeparatorAbove={kindIndex > 0}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * One MediaKind section inside the dropdown. Self-hides when the catalog
 * has zero templates of this kind — no caller-passed `hasPodcastTemplates`
 * boolean. Header label reads from MEDIA_KIND_UI so a rename ripples once.
 */
function KindSection({
  kind,
  defaultTemplate,
  onPick,
  showSeparatorAbove,
}: {
  kind: MediaKind;
  defaultTemplate: ContentTemplate;
  onPick: (id: ContentTemplate) => void;
  showSeparatorAbove: boolean;
}) {
  const items: TemplateDef[] = TEMPLATE_CATALOG.filter((t) => t.mediaKind === kind);
  if (items.length === 0) return null;
  return (
    <>
      {showSeparatorAbove && <DropdownMenuSeparator />}
      <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
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
    </>
  );
}
