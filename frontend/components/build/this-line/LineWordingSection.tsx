/**
 * "This line" › Wording: edit the selected line in place (Save = one Undo
 * step), use a rewrite a scoring run suggested, or ask the AI to rewrite it
 * one way ("Say how", "Add a result", "Shorter") — the same chat revision the
 * Strengthen stage's "Rewrite weak bullets" uses, with its gate unchanged.
 * Presentational: the container commits and asks.
 */
import { useId, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { INSPECTOR_LABEL as CAPTION } from "@/components/workspace/inspector/inspector-styles";

export const LINE_REWRITE_INTENTS = ["how", "result", "shorter"] as const;
export type LineRewriteIntent = (typeof LINE_REWRITE_INTENTS)[number];

interface LineWordingSectionProps {
  /** The line as it reads on the page now. */
  text: string;
  /** Rewrites a scoring run suggested for this line. */
  suggestions: ReadonlyArray<{ id: string; text: string }>;
  onCommit: (text: string) => void;
  onRewrite: (intent: LineRewriteIntent) => void;
}

export default function LineWordingSection({ text, suggestions, onCommit, onRewrite }: LineWordingSectionProps) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [draft, setDraft] = useState(text);
  const changed = draft.trim() !== "" && draft.trim() !== text.trim();
  const save = () => {
    if (changed) onCommit(draft.trim());
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className={CAPTION}>
          {t("build.thisLine.wording.label")}
        </label>
        <Textarea
          id={fieldId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          className="resize-y text-sm leading-snug [field-sizing:content]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="min-h-11" disabled={!changed} onClick={save}>
            {t("build.thisLine.wording.save")}
          </Button>
          <Button size="sm" variant="ghost" className="min-h-11" disabled={draft === text} onClick={() => setDraft(text)}>
            {t("build.thisLine.wording.reset")}
          </Button>
          <span className="text-xs text-muted-foreground">{t("build.thisLine.wording.undoHint")}</span>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className={CAPTION}>{t("build.thisLine.wording.suggested")}</p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {suggestions.map((s) => (
              <li key={s.id} className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-2.5 text-sm">
                <span className="[overflow-wrap:anywhere]">{s.text}</span>
                <Button size="sm" variant="outline" className="min-h-11 self-start" onClick={() => setDraft(s.text)}>
                  {t("build.thisLine.wording.useSuggestion")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <p className={CAPTION}>{t("build.thisLine.wording.aiTitle")}</p>
        <div className="flex flex-wrap gap-1.5">
          {LINE_REWRITE_INTENTS.map((intent) => (
            <Button
              key={intent}
              size="sm"
              variant="outline"
              className="min-h-11 gap-1.5"
              onClick={() => onRewrite(intent)}
            >
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
              {t(`build.thisLine.wording.intent.${intent}`)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
