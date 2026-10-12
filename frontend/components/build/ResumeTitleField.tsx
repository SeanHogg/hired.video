/**
 * The open résumé's name above the kit page, renamed in place: click the
 * name (or its pencil), type, Enter or click away to save, Escape to cancel.
 * Read-only until the draft has a saved row.
 */
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ResumeTitleControls } from "@/lib/build/use-resume-title";

export default function ResumeTitleField({ controls }: { controls: ResumeTitleControls }) {
  const { t } = useTranslation();
  const { title, canRename, rename } = controls;
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // Enter submits, then the input's blur fires too: save once.
  const busyRef = useRef(false);

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (draft === null || busyRef.current) return;
    if (!draft.trim()) {
      setDraft(null);
      return;
    }
    busyRef.current = true;
    setSaving(true);
    setFailed(false);
    try {
      await rename(draft);
      setDraft(null);
    } catch {
      setFailed(true);
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setDraft(null);
      setFailed(false);
    }
  };

  if (draft !== null) {
    return (
      <form onSubmit={(e) => void save(e)} className="flex min-w-0 flex-[1_1_220px] items-center gap-2">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={onKeyDown}
          disabled={saving}
          aria-label={t("build.title.label")}
          aria-invalid={failed || undefined}
          className="h-11 min-w-0 text-sm font-semibold sm:h-8"
        />
        {saving && <Loader2 aria-hidden="true" className="h-4 w-4 flex-none animate-spin text-muted-foreground" />}
        {failed && (
          <span role="alert" className="text-xs text-destructive">
            {t("build.title.failed")}
          </span>
        )}
      </form>
    );
  }

  if (!canRename) {
    return <span className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => setDraft(title)}
      aria-label={t("build.title.rename", { title })}
      className="group inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-md px-1 text-left text-sm font-semibold text-foreground hover:bg-muted sm:min-h-8"
    >
      <span className="truncate">{title}</span>
      <Pencil aria-hidden="true" className="h-3.5 w-3.5 flex-none text-muted-foreground group-hover:text-foreground" />
    </button>
  );
}
