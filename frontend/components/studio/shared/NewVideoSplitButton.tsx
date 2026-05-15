/**
 * NewVideoSplitButton — the split-button "+ New Video [▼]" affordance
 * for the Studio landing. Main click creates a draft with the user's
 * last-used template; the chevron reveals every template in the catalog
 * so they can switch starter in one click.
 *
 * Save / navigate / "last-used template" persistence all live in the
 * shared `useCreateStudioDraft` hook so this component is just chrome
 * over that primitive — every "start a new video" path routes through
 * the same hook (DRY).
 */
import { Check, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TEMPLATE_CATALOG,
  type ContentTemplate,
} from "@/components/studio/templates/catalog";
import { useCreateStudioDraft } from "@/lib/studio/use-create-studio-draft";
import { cn } from "@/lib/utils";

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

  const mainLabel = creating
    ? "Creating…"
    : `New ${TEMPLATE_CATALOG.find((t) => t.id === defaultTemplate)?.label ?? "Video"}`;
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
          {TEMPLATE_CATALOG.map((t) => {
            const Icon = t.icon;
            const isDefault = defaultTemplate === t.id;
            return (
              <DropdownMenuItem
                key={t.id}
                onClick={() => startNewWithTemplate(t.id)}
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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
