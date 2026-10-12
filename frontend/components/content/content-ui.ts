// Class-name tokens for the content surfaces (blog, articles, help, guides,
// learning, feed, search). One place for the reading column width, the
// prose treatment and the hero type scale so every reading and index
// page composes the same system instead of re-deriving it.

/** 740px reading column with the standard 24px side gutter. */
export const READING_COLUMN = "mx-auto w-full max-w-[740px] px-6";

/** 1200px marketing/index column (matches MarketingBand). */
export const INDEX_COLUMN = "mx-auto w-full max-w-[1200px] px-6";

/**
 * Long-form body copy: Tailwind typography, recoloured onto theme tokens so
 * light + dark both read correctly, display face on headings, primary links.
 */
export const PROSE_CLASS = [
  "prose prose-slate max-w-none dark:prose-invert",
  "text-[17px] leading-relaxed",
  "prose-headings:font-display prose-headings:tracking-tight prose-headings:text-foreground",
  "prose-p:text-foreground/85 prose-li:text-foreground/85 prose-strong:text-foreground",
  "prose-a:font-medium prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
  "prose-blockquote:border-l-primary prose-hr:border-border prose-code:text-foreground",
  "prose-img:rounded-2xl",
].join(" ");

/** Mono uppercase eyebrow chip that opens a hero. */
export const EYEBROW_CHIP =
  "inline-flex items-center gap-1.5 self-start rounded-full bg-accent px-2.5 py-1.5 font-mono text-xs uppercase tracking-[0.08em] text-accent-foreground";

/** Secondary text link next to a primary CTA. */
export const TEXT_LINK =
  "inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-primary hover:underline";

/** Standard content card surface. */
export const CONTENT_CARD = "rounded-[20px] border border-border bg-card";

/** 44px icon tile (accent ground, primary glyph). */
export const ICON_TILE =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary";
