/**
 * MergeProjectsDialog — combine the selected Studio projects into ONE new
 * draft. The user names the result and sets the play order (up/down); the
 * merge itself is the `mergeStudioProjects` use case. Sources are kept, so
 * merging is never destructive — the user can delete them afterwards from
 * the same bulk bar.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { StudioProject } from "@/lib/services/studio-service";
import { mergeStudioProjects } from "@/lib/studio/merge-studio-projects";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: readonly StudioProject[];
  onMerged: (merged: StudioProject) => void;
}

export default function MergeProjectsDialog({ open, onOpenChange, projects, onMerged }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [order, setOrder] = useState<StudioProject[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-seed each time the dialog opens with the current selection.
  useEffect(() => {
    if (!open) return;
    setOrder([...projects]);
    setTitle(
      t("messages.studioMerge.defaultTitle", { title: projects[0]?.title ?? "" }),
    );
  }, [open]);

  function move(index: number, delta: -1 | 1) {
    setOrder((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleMerge() {
    const name = title.trim();
    if (!name) return;
    setBusy(true);
    try {
      const merged = await mergeStudioProjects(order, name);
      toast({ title: t("messages.studioMerge.merged", { title: merged.title }) });
      onMerged(merged);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: t("messages.studioMerge.failed"),
        description: err instanceof Error ? err.message : t("errors.unknownErrorAdmin"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("messages.studioMerge.title", { count: order.length })}</DialogTitle>
          <DialogDescription>{t("messages.studioMerge.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="studio-merge-title">{t("labels.studioMerge.newTitle")}</Label>
          <Input
            id="studio-merge-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("labels.studioMerge.order")}</p>
          <ol className="max-h-64 space-y-1.5 overflow-y-auto">
            {order.map((project, i) => (
              <li
                key={project.id}
                className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5"
              >
                <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{project.title}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={busy || i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={t("labels.studioMerge.moveUpAria", { title: project.title })}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={busy || i === order.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={t("labels.studioMerge.moveDownAria", { title: project.title })}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ol>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button disabled={busy || !title.trim() || order.length < 2} onClick={handleMerge}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {busy ? t("messages.studioMerge.merging") : t("actions.studioMerge.merge")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
