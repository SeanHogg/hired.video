/**
 * The cover letter as a page — the same paper as the résumé beside it
 * (force-light-scope: a document is always printed on white). The sender
 * block comes from the résumé header (shared/cover-letter.ts), so it is
 * edited there; every line the letter owns is typed on in place when
 * `onChange` is given. Presentational: it owns no data.
 */
import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ResumeContent } from "@shared/resume";
import { coverLetterSender, type CoverLetter } from "@shared/cover-letter";
import { formatLetterDate } from "@/lib/cover-letter-export";
import { letterStyleVars } from "@/lib/build/cover-letter/letter-style";

/** A line of the letter that reads as text and types like a field. */
function LetterText({
  value,
  label,
  onChange,
  className = "",
}: {
  value: string;
  label: string;
  onChange?: (next: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  if (!onChange) return <p className={`whitespace-pre-line ${className}`}>{value}</p>;
  return (
    <textarea
      ref={ref}
      aria-label={label}
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      className={`block w-full resize-none overflow-hidden rounded-sm border-0 bg-transparent p-0 text-inherit outline-none ring-primary/40 hover:bg-primary/5 focus:bg-primary/5 focus:ring-2 ${className}`}
    />
  );
}

interface Props {
  letter: CoverLetter;
  /** The résumé the letter goes with — its header is the sender block. */
  content: ResumeContent;
  onChange?: (letter: CoverLetter) => void;
  zoom?: number;
  /** On a host's paper (the kit's document stage): no frame, no zoom, and
   *  the type comes from the paper (the letter's style). */
  bare?: boolean;
}

export default function CoverLetterPage({ letter, content, onChange, zoom = 1, bare = false }: Props) {
  const { t, i18n } = useTranslation();
  const sender = coverLetterSender(content);
  const edit = onChange
    ? <K extends keyof CoverLetter>(key: K) => (value: CoverLetter[K]) => onChange({ ...letter, [key]: value })
    : null;
  const editList = (key: "opening" | "closing", i: number) =>
    edit ? (text: string) => edit(key)(letter[key].map((p, j) => (j === i ? text : p))) : undefined;
  const editHighlight = (i: number) =>
    edit ? (text: string) => edit("highlights")(letter.highlights.map((h, j) => (j === i ? { ...h, text } : h))) : undefined;

  // Framed: the letter's own type and sheet (letter.style, defaults when it
  // has none). Bare: the host's paper already sets them.
  const look = bare ? null : letterStyleVars(letter.style);

  return (
    <div className={bare ? "w-full" : "mx-auto w-full max-w-[880px]"} style={bare ? undefined : { zoom }}>
      <article
        aria-label={t("build.letter.pageLabel")}
        style={
          look
            ? {
                fontFamily: look.fontFamily,
                fontSize: look.fontSize,
                lineHeight: look.lineHeight,
                // At least one sheet tall (Letter or A4); a long letter grows.
                aspectRatio: `${look.pageWidthIn} / ${look.pageHeightIn}`,
              }
            : undefined
        }
        className={
          bare
            ? "force-light-scope bg-card p-[0.9in] text-foreground"
            : "force-light-scope rounded-md bg-card px-6 py-8 text-foreground shadow-[0_1px_0_hsl(var(--input)),0_30px_60px_-36px_hsl(var(--ink)/0.45)] sm:px-14 sm:py-14"
        }
      >
        {/* em, so the sender block follows the letter's type size. */}
        {sender.name && <p className="text-[1.4em] font-bold">{sender.name}</p>}
        {sender.contact.length > 0 && <p className="mb-6 text-[0.9em] text-muted-foreground">{sender.contact.join(" · ")}</p>}
        <p className="mb-4">{formatLetterDate(letter.date, i18n.language)}</p>
        {(letter.recipientLines.length > 0 || edit) && (
          <LetterText
            className="mb-4"
            label={t("build.letter.recipient")}
            value={letter.recipientLines.join("\n")}
            onChange={edit ? (v) => edit("recipientLines")(v.split("\n")) : undefined}
          />
        )}
        <LetterText className="mb-4" label={t("build.letter.salutation")} value={letter.salutation} onChange={edit?.("salutation")} />
        {letter.opening.map((para, i) => (
          <LetterText key={`o${i}`} className="mb-4" label={t("build.letter.paragraph")} value={para} onChange={editList("opening", i)} />
        ))}
        {letter.highlightsIntro && (
          <LetterText className="mb-3" label={t("build.letter.paragraph")} value={letter.highlightsIntro} onChange={edit?.("highlightsIntro")} />
        )}
        {letter.highlights.length > 0 && (
          <ul className="mb-4 flex list-disc flex-col gap-2 pl-5">
            {letter.highlights.map((h, i) => (
              <li key={`h${i}`}>
                {h.label && <span className="font-semibold">{h.label}. </span>}
                <LetterText label={h.label || t("build.letter.paragraph")} value={h.text} onChange={editHighlight(i)} />
              </li>
            ))}
          </ul>
        )}
        {letter.closing.map((para, i) => (
          <LetterText key={`c${i}`} className="mb-4" label={t("build.letter.paragraph")} value={para} onChange={editList("closing", i)} />
        ))}
        <LetterText className="mb-6" label={t("build.letter.signOff")} value={letter.signOff} onChange={edit?.("signOff")} />
        {sender.name && <p>{sender.name}</p>}
      </article>
    </div>
  );
}
