/**
 * A free block on the résumé page — the text / image / divider / spacer a
 * résumé authored on the document canvas carries between its sections
 * (#2101). Arrives as a `document-block` component in the descriptor
 * (resume-document-descriptor.ts) so the declarative render keeps it in
 * place instead of dropping it.
 */
export interface FreeBlockProps {
  kind?: unknown;
  text?: unknown;
  imageUrl?: unknown;
}

export default function FreeBlock({ kind, text, imageUrl }: FreeBlockProps) {
  if (kind === "divider") return <hr className="my-2 border-border" />;
  if (kind === "spacer") return <div className="h-6" aria-hidden="true" />;
  if (kind === "image") {
    return typeof imageUrl === "string" && imageUrl ? (
      <img src={imageUrl} alt="" className="max-w-full rounded" />
    ) : null;
  }
  if (kind === "text") {
    return typeof text === "string" && text.trim() ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p> : null;
  }
  return null;
}
