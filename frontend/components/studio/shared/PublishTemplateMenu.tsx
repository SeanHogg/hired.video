/**
 * PublishTemplateMenu — single source of truth for the "publish current
 * project as a marketplace template" + "manage my published templates"
 * surface. Self-contained dropdown + dialog mounts so every editor
 * (v1 storyboard, v2 canvas, future surfaces) drops this in and gets
 * the full flow for free.
 *
 * Self-gates: returns null when `projectId` is null (you cannot publish
 * an unsaved project). Consumers never need to compute a `canPublish`
 * boolean — the component handles it internally.
 *
 * The wrapped `PublishAsTemplateDialog` reads the source project's
 * `storyboard` server-side, so callers must have saved the project at
 * least once before opening this menu. V2 must additionally route its
 * canvas-state through `canvasStateToScript()` on save so the storyboard
 * column is populated for NLE projects (#628).
 */
import { lazy, Suspense, useState } from "react";
import { Library, MoreHorizontal, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

const PublishAsTemplateDialog = lazy(
  () => import("@/components/studio/PublishAsTemplateDialog"),
);
const CreatorTemplatesPanel = lazy(
  () => import("@/components/studio/CreatorTemplatesPanel"),
);

interface Props {
  /** Source project id. The menu disappears until the project has been
   *  saved — there is nothing to publish without a persisted row. */
  projectId: string | null;
  /** Project title — used to pre-fill the listing name in the dialog. */
  projectTitle: string;
  /** Trigger button variant. Defaults to "ghost". V2's header is tight on
   *  space; v1 can pass "outline" for a stronger affordance. */
  triggerVariant?: "ghost" | "outline";
  /** Optional inline VideoScript getter. V2 callers pass
   *  `() => canvasStateToScript(state)` so the V2 project row doesn't
   *  duplicate the v1 storyboard column on every save (#637). When
   *  omitted, the backend reads from `project.storyboard` — the V1
   *  publish path is unchanged. */
  getVideoScript?: () => unknown;
}

export default function PublishTemplateMenu({
  projectId,
  projectTitle,
  triggerVariant = "ghost",
  getVideoScript,
}: Props) {
  const { toast } = useToast();
  const [publishOpen, setPublishOpen] = useState(false);
  const [myTemplatesOpen, setMyTemplatesOpen] = useState(false);

  if (!projectId) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={triggerVariant}
            size="sm"
            className="h-8 w-8 p-0"
            aria-label="Template actions"
            title="Publish to marketplace · My published templates"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setPublishOpen(true)}>
            <Store className="mr-2 h-3.5 w-3.5" />
            Publish as Marketplace Template
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMyTemplatesOpen(true)}>
            <Library className="mr-2 h-3.5 w-3.5" />
            My published templates
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {publishOpen && (
        <Suspense fallback={null}>
          <PublishAsTemplateDialog
            open={publishOpen}
            onOpenChange={setPublishOpen}
            projectId={projectId}
            defaultName={projectTitle}
            getVideoScript={getVideoScript}
          />
        </Suspense>
      )}

      {myTemplatesOpen && (
        <Suspense fallback={null}>
          <CreatorTemplatesPanel
            open={myTemplatesOpen}
            onOpenChange={setMyTemplatesOpen}
            onEditTemplate={(t) => {
              // Loading the source project into the editor is a separate
              // follow-up flow (#633). For now the panel closes and points
              // the user at their Recent list. Same behaviour as v1 so the
              // surface is consistent across editors.
              setMyTemplatesOpen(false);
              toast({
                title: "Open template to edit",
                description: t.sourceProjectId
                  ? "Switch to the source project from Recent to keep editing."
                  : "Templates without a source project can be edited from the marketplace listing.",
              });
            }}
          />
        </Suspense>
      )}
    </>
  );
}
