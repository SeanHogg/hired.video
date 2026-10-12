/**
 * The reviewer's proposed-draft editor (#2220): a right slide-out with every
 * line of the résumé editable in place ("Edit"), and the draft-vs-current
 * diff ("Changes") before it is sent. The owner then accepts or rejects the
 * whole draft from the feedback rail. Logic lives in
 * lib/review-feedback/proposed-draft.ts; this only renders it.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilePenLine, Loader2 } from "lucide-react";
import type { ResumeContent } from "@shared/resume";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { applyDraftEdits, draftChanges, draftLines } from "@/lib/review-feedback/proposed-draft";

interface ProposeDraftSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The résumé as the reviewer sees it. */
  content: ResumeContent;
  busy: boolean;
  onSubmit: (draft: ResumeContent, label: string) => Promise<void>;
}

type View = "edit" | "changes";

export default function ProposeDraftSheet({ open, onOpenChange, content, busy, onSubmit }: ProposeDraftSheetProps) {
  const { t } = useTranslation();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("");
  const [view, setView] = useState<View>("edit");
  const lines = useMemo(() => draftLines(content), [content]);
  const changes = useMemo(() => draftChanges(content, edits), [content, edits]);

  const submit = async () => {
    if (changes.length === 0) return;
    await onSubmit(applyDraftEdits(content, edits), label.trim());
    setEdits({});
    setLabel("");
    setView("edit");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle className="flex items-center gap-2">
            <FilePenLine aria-hidden="true" className="h-4 w-4 text-primary" />
            {t("review.propose.title")}
          </SheetTitle>
          <SheetDescription>{t("review.propose.description")}</SheetDescription>
          <div className="mt-2 flex gap-1 text-sm" role="tablist">
            {(["edit", "changes"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                className={`min-h-9 rounded-md px-3 ${view === v ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
                onClick={() => setView(v)}
              >
                {v === "edit" ? t("review.propose.edit") : t("review.propose.changes", { count: changes.length })}
              </button>
            ))}
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {view === "edit" ? (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {lines.map((line) => (
                <li key={line.path}>
                  <label htmlFor={`draft-${line.path}`} className="mb-1 block text-xs font-medium text-muted-foreground [overflow-wrap:anywhere]">
                    {[t(`review.propose.section.${line.section}`, { defaultValue: line.section }), line.entry].filter(Boolean).join(" · ")}
                  </label>
                  <Textarea
                    id={`draft-${line.path}`}
                    value={edits[line.path] ?? line.text}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [line.path]: e.target.value }))}
                    rows={line.field === "summary" || line.field === "description" ? 3 : 2}
                    className="text-sm"
                  />
                </li>
              ))}
            </ul>
          ) : changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("review.propose.noChanges")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm [overflow-wrap:anywhere]">
              {changes.map((c) => (
                <li key={c.id} className="rounded-lg border p-2">
                  {c.before && <del className="block rounded bg-diff-removed px-1 text-diff-removed-foreground">{c.before}</del>}
                  {c.after && <ins className="mt-1 block rounded bg-diff-added px-1 text-diff-added-foreground no-underline">{c.after}</ins>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <SheetFooter className="flex-col gap-2 border-t p-4 sm:flex-col sm:space-x-0">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
            placeholder={t("review.propose.labelPlaceholder")}
            aria-label={t("review.propose.labelPlaceholder")}
          />
          <Button className="min-h-11 w-full" disabled={busy || changes.length === 0} onClick={() => void submit()}>
            {busy && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
            {t("review.propose.submit", { count: changes.length })}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
