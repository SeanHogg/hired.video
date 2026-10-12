/**
 * Bottom-of-column composer for the kit workspace. Before a resume exists it takes a
 * self-description ("Product designer, 8 years in health-tech…") and offers a
 * paperclip for a file; afterwards it takes change requests, with one-tap
 * suggestion chips.
 */
import { useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, Paperclip } from "lucide-react";
import { RESUME_FILE_ACCEPT } from "@/lib/build-entry";
import { useDockedAIChat } from "@/lib/ai-context";

export interface ComposerSuggestion {
  /** i18n key — the chip label AND the request text sent. */
  labelKey: string;
}

interface BuildComposerProps {
  placeholder: string;
  onSubmit: (text: string) => void;
  suggestions?: readonly ComposerSuggestion[];
  /** Extra chips (<li>s) ahead of the suggestions, e.g. the stage's tools. */
  chips?: ReactNode;
  disabled?: boolean;
  /** When set, a paperclip button picks a resume file. */
  onAttach?: (file: File) => void;
}

export default function BuildComposer({ placeholder, onSubmit, suggestions = [], chips, disabled, onAttach }: BuildComposerProps) {
  const { t } = useTranslation();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  // This composer IS the page's AI chat — suppress the global floating Brain.
  useDockedAIChat();

  const send = (value: string) => {
    const v = value.trim();
    if (!v || disabled) return;
    onSubmit(v);
    setText("");
  };

  return (
    <div className="flex min-w-0 flex-none flex-col gap-2.5 border-t border-border bg-card px-4 pb-4 pt-3">
      {(suggestions.length > 0 || chips) && (
        <ul className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label={t("build.composer.suggestions")}>
          {chips}
          {suggestions.map((s) => (
            <li key={s.labelKey} className="flex-none">
              <button
                type="button"
                disabled={disabled}
                onClick={() => send(t(s.labelKey))}
                className="min-h-11 whitespace-nowrap rounded-full border border-border bg-card px-3 text-[13px] text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50 sm:min-h-[34px]"
              >
                {t(s.labelKey)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-end gap-2 rounded-2xl border border-input bg-card p-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        {onAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={RESUME_FILE_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onAttach(file);
              }}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileRef.current?.click()}
              aria-label={t("build.composer.attach")}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-[10px] bg-muted text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              <Paperclip aria-hidden="true" className="h-[18px] w-[18px]" />
            </button>
          </>
        )}
        <label htmlFor={id} className="sr-only">
          {t("build.composer.label")}
        </label>
        <textarea
          id={id}
          value={text}
          rows={2}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          // Empty: a long placeholder wrapping in a narrow rail must not grow a scrollbar.
          className={`min-h-11 min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[15px] leading-[1.45] text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60 ${text ? "" : "overflow-hidden"}`}
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          aria-label={t("build.composer.send")}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-[10px] bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <ArrowUp aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </button>
      </form>
    </div>
  );
}
