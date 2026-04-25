import Markdown from "@/components/Markdown";

interface MarkdownPreviewProps {
  children: string | null | undefined;
  clamp?: 1 | 2 | 3;
  className?: string;
}

// Renders markdown collapsed onto a single line of text and clamped to N lines.
// Block elements (h1–h4, p, ul, ol, li) are forced inline so a leading "## ..."
// doesn't render as a giant heading inside a small preview.
export default function MarkdownPreview({
  children,
  clamp = 2,
  className = "",
}: MarkdownPreviewProps) {
  if (!children) return null;

  const clampClass =
    clamp === 1 ? "line-clamp-1" : clamp === 3 ? "line-clamp-3" : "line-clamp-2";

  const inlineReset =
    "[&>div]:contents [&_*]:!m-0 [&_*]:!text-sm [&_*]:!font-normal [&_*]:!leading-snug " +
    "[&_h1]:!inline [&_h2]:!inline [&_h3]:!inline [&_h4]:!inline " +
    "[&_p]:!inline [&_ul]:!inline [&_ol]:!inline [&_li]:!inline";

  return (
    <div className={`${clampClass} ${inlineReset} ${className}`.trim()}>
      <Markdown>{children}</Markdown>
    </div>
  );
}
