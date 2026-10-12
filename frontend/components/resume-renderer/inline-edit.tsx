/**
 * Inline-edit mode of the declarative résumé renderer (#1916 / #2101): the
 * page is the form. With a provider mounted, every text field the page draws
 * (`EditableText`, and every `AnnotatedText` whose path is a text field)
 * can be edited IN PLACE — same layout, same columns, same typography —
 * instead of opening a side form. Edits commit on blur / Enter through
 * `applyInlineEdit` (lib/studio/document/resume-inline-edit.ts), which writes
 * only the edited field of the entity content.
 *
 * Activation is ONE rule for every host: a single click is the host's (the
 * kit selects the line under it), a DOUBLE-click (or Enter / F2 on a focused
 * field) starts typing in place. While typing, the field keeps its clicks to
 * itself so a host's click handler never steals focus or re-selects; blur
 * commits, Escape reverts.
 *
 * With no provider (every read-only page, print, thumbnails), the wrappers
 * render their children untouched.
 */
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type { ResumeContent } from "@shared/resume";
import { readAt, type ContentPath } from "@shared/resume-path";
import { applyInlineEdit, inlineEditTarget } from "@/lib/studio/document/resume-inline-edit";
import { cn } from "@/lib/utils";

export interface ResumeInlineEdit {
  content: ResumeContent;
  onChange: (next: ResumeContent) => void;
}

const InlineEditContext = createContext<ResumeInlineEdit | null>(null);

export function ResumeInlineEditProvider({ value, children }: { value?: ResumeInlineEdit; children: ReactNode }) {
  return <InlineEditContext.Provider value={value ?? null}>{children}</InlineEditContext.Provider>;
}

/** True while the page is in inline-edit mode (entries stay open, toggles
 *  don't steal the click). */
export function useResumeInlineEditing(): boolean {
  return useContext(InlineEditContext) !== null;
}

interface EditableTextProps {
  /** Content path of the field (`work.2.position`, `basics.summary`). */
  path?: ContentPath;
  /** Read-mode render (may be formatted); edit mode shows the raw value. */
  children?: ReactNode;
  className?: string;
}

/** One text field of the page — plain text when read-only, a field that
 *  edits in place on double-click when the inline-edit mode is on. */
export function EditableText({ path, children, className }: EditableTextProps) {
  const edit = useContext(InlineEditContext);
  const target = useMemo(() => (path ? inlineEditTarget(path) : null), [path]);
  if (!edit || !path || !target) return className ? <span className={className}>{children}</span> : <>{children}</>;
  return (
    <InlineField edit={edit} path={path} multiline={target.multiline} className={className}>
      {children}
    </InlineField>
  );
}

type Point = { x: number; y: number };

/** Put the caret where the double-click landed (or at the end). */
function placeCaret(el: HTMLElement, at: Point | null) {
  const doc = el.ownerDocument;
  const sel = doc.getSelection?.();
  if (!sel) return;
  let range: Range | null = null;
  if (at) {
    const d = doc as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    if (d.caretRangeFromPoint) range = d.caretRangeFromPoint(at.x, at.y);
    else if (d.caretPositionFromPoint) {
      const pos = d.caretPositionFromPoint(at.x, at.y);
      if (pos) {
        range = doc.createRange();
        range.setStart(pos.offsetNode, pos.offset);
      }
    }
    if (range && !el.contains(range.startContainer)) range = null;
  }
  if (!range) {
    range = doc.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

const FIELD_CLASS = "cursor-text rounded-[3px] outline-none transition-colors hover:bg-primary/10";
const EMPTY_CLASS =
  "empty:inline-block empty:min-w-[4ch] empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]";

interface InlineFieldProps {
  edit: ResumeInlineEdit;
  path: ContentPath;
  multiline: boolean;
  className?: string;
  children?: ReactNode;
}

function InlineField({ edit, path, multiline, className, children }: InlineFieldProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(false);
  const caretAt = useRef<Point | null>(null);
  const cancelled = useRef(false);
  const raw = readAt(edit.content, path);
  const value = typeof raw === "string" ? raw : "";

  // Typing starts: focus the field and put the caret under the pointer.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    el.focus();
    placeCaret(el, caretAt.current);
  }, [active]);

  const activate = (at: Point | null) => {
    caretAt.current = at;
    cancelled.current = false;
    setActive(true);
  };

  const commit = () => {
    const el = ref.current;
    setActive(false);
    if (!el || cancelled.current) return;
    // innerText keeps typed line breaks; textContent where it's absent (jsdom).
    const typed = (el.innerText as string | undefined) ?? el.textContent ?? "";
    const result = applyInlineEdit(edit.content, path, typed);
    if (result.ok && result.changed) edit.onChange(result.content);
  };

  const onEditKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelled.current = true;
      if (ref.current) ref.current.textContent = value;
      ref.current?.blur();
      setActive(false);
      return;
    }
    // One-line fields commit on Enter; paragraphs take Shift+Enter breaks
    // and commit on Enter too (Shift+Enter inserts the break).
    if (e.key === "Enter" && (!multiline || !e.shiftKey)) {
      e.preventDefault();
      ref.current?.blur();
    }
  };

  // While typing, the field's clicks are its own (no host re-select / clear).
  const keep = (e: MouseEvent) => e.stopPropagation();
  const hint = t("resume.inline.doubleClickHint");

  if (!active) {
    const shown = children === undefined || children === null || children === "" ? value : children;
    return (
      <span
        ref={ref}
        data-inline-path={path}
        data-placeholder={t("resume.inline.placeholder")}
        tabIndex={0}
        title={hint}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          activate({ x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "F2") {
            e.preventDefault();
            activate(null);
          }
        }}
        className={cn(FIELD_CLASS, EMPTY_CLASS, "focus-visible:ring-2 focus-visible:ring-primary/40", multiline && "whitespace-pre-wrap", className)}
      >
        {shown}
      </span>
    );
  }

  return (
    <span
      // Remount when the stored value changes, so React never patches text
      // the browser's editing has already rearranged.
      key={value}
      ref={ref}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={multiline}
      aria-label={t("resume.inline.editField")}
      data-inline-path={path}
      data-inline-active=""
      data-placeholder={t("resume.inline.placeholder")}
      tabIndex={0}
      onClick={keep}
      onMouseDown={keep}
      onDoubleClick={keep}
      onBlur={commit}
      onKeyDown={onEditKeyDown}
      className={cn(FIELD_CLASS, EMPTY_CLASS, "bg-primary/10 ring-2 ring-primary/40", multiline && "whitespace-pre-wrap", className)}
    >
      {value}
    </span>
  );
}
