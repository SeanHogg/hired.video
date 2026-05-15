/**
 * NewVideoSplitButton — the split-button "+ New Video [▼]" affordance
 * surfaced inside the Studio editor (v1 sidebar + v2 editor header) AND
 * the Studio chooser landing. Main click creates a draft with the
 * user's last-used template; the chevron reveals every template in the
 * catalog so they can switch starter in one click.
 *
 * Single source of truth: every "start a new video" path in the Studio
 * routes through this component, which means:
 *   - The "last-used template" memory (localStorage key
 *     `studio_default_template`) lives in one place.
 *   - The editor-kind decision (`useEditorPreference().isV2 ? "nle" :
 *     "scene"`) lives in one place — the consumer doesn't pass a
 *     `kind` prop the component could compute itself (DRY).
 *   - The seeded-timeline + saveDraft + navigate dance is identical
 *     across consumers.
 *
 * Self-gating: returns its trigger unconditionally because the action
 * is always available to an authenticated Studio user; auth itself is
 * enforced by the route, not this component.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
  TEMPLATE_CATALOG,
  getTemplate,
  type ContentTemplate,
} from "@/components/studio/templates/catalog";
import { studioService } from "@/lib/services/studio-service";
import { useEditorPreference } from "@/lib/studio/editor-v2/preferences";
import { seedCanvasFromTemplate } from "@/lib/studio/editor-v2/template-seeds";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
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
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isV2 } = useEditorPreference();
  const [defaultTemplate, setDefaultTemplate] = usePersistentState<ContentTemplate>(
    "studio_default_template",
    "basic",
  );
  const [creating, setCreating] = useState(false);

  async function startNewWithTemplate(id: ContentTemplate) {
    if (creating) return;
    setDefaultTemplate(id);
    setCreating(true);
    try {
      const template = getTemplate(id);
      // v2 needs a seeded `timelineSpec` so the new draft opens with
      // the template's layout already in place; v1 ignores it and
      // re-derives from `script`. canvasStateToTimeline encodes the
      // seed as canvas-v2 effects — same path as StudioLanding.
      const seededTimeline = isV2
        ? canvasStateToTimeline(seedCanvasFromTemplate(id))
        : undefined;
      const res = await studioService.saveDraft({
        name: template.defaultName,
        kind: isV2 ? "nle" : "scene",
        timelineSpec: seededTimeline,
      });
      const created = res.data;
      if (!created?.id) throw new Error("No project id returned");
      navigate(`/studio/${encodeURIComponent(created.id)}`);
    } catch (err) {
      toast({
        title: "Couldn't create video",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
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
                onClick={() => void startNewWithTemplate(t.id)}
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
