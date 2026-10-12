/**
 * AutosaveConflictPrompt — the ONE "a newer copy exists" choice every
 * autosaving editor shows (#2242).
 *
 * useServerAutosave pauses and reports a `conflict` when another tab saved
 * the same document, or when the server refused this tab's save as stale
 * (another device saved since). This hook turns that into a persistent toast
 * with the two choices — load the newer copy, or keep this tab's copy (which
 * overwrites it) — so no editor overwrites someone's newer work silently and
 * none has to build its own dialog. The editor supplies how to load the newer
 * copy (the studio reloads; the résumé workspace swaps the content in).
 */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ServerAutosave } from "@/lib/studio/editor-v2/use-server-autosave";

type ConflictControls = Pick<ServerAutosave, "conflict" | "keepMine" | "dismissConflict">;

const TOAST_ID_PREFIX = "autosave-conflict:";

function ConflictCard({
  messageKey,
  onLoadNewer,
  onKeepMine,
}: {
  messageKey: string;
  onLoadNewer: () => void;
  onKeepMine: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alertdialog"
      aria-labelledby="autosave-conflict-title"
      className="w-[calc(100vw-2rem)] max-w-sm rounded-lg border border-border bg-background p-4 text-foreground shadow-lg"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p id="autosave-conflict-title" className="text-sm font-semibold">
            {t("autosave.conflict.title")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t(messageKey)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={onLoadNewer}>
              {t("autosave.conflict.loadNewer")}
            </Button>
            <Button size="sm" variant="outline" onClick={onKeepMine}>
              {t("autosave.conflict.keepMine")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Show the conflict choice while `autosave.conflict` is set. `documentKey`
 * keeps one toast per document; `onLoadNewer` replaces this tab's copy with
 * the server's (it may reload the page).
 */
export function useAutosaveConflictPrompt(
  autosave: ConflictControls,
  documentKey: string | null,
  onLoadNewer: () => void | Promise<void>,
): void {
  const { t } = useTranslation();
  const loadRef = useRef(onLoadNewer);
  loadRef.current = onLoadNewer;
  const { conflict, keepMine, dismissConflict } = autosave;

  useEffect(() => {
    if (!conflict || !documentKey) return;
    const id = TOAST_ID_PREFIX + documentKey;
    const loadNewer = async () => {
      toast.dismiss(id);
      try {
        await loadRef.current();
        dismissConflict();
      } catch {
        toast.error(t("autosave.conflict.loadFailed"));
      }
    };
    const keep = () => {
      toast.dismiss(id);
      keepMine();
    };
    toast.custom(
      () => (
        <ConflictCard
          messageKey={conflict === "stale" ? "autosave.conflict.stale" : "autosave.conflict.remote"}
          onLoadNewer={() => void loadNewer()}
          onKeepMine={keep}
        />
      ),
      { id, duration: Infinity },
    );
    return () => {
      toast.dismiss(id);
    };
  }, [conflict, documentKey, keepMine, dismissConflict, t]);
}
