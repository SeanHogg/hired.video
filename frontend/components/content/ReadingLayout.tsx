// Building blocks for every long-form reading page (blog post, article,
// help article, guide): back link, header (eyebrow chip → display h1 →
// lede → mono meta line), and the related-content card grid. Pages own
// their data; these own the look.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { joinMeta } from "@/lib/content/reading-meta";
import MonoChip from "@/components/templates/MonoChip";
import { CONTENT_CARD, EYEBROW_CHIP } from "./content-ui";

/** Muted "← Back to …" link above a reading header. */
export function ReadingBackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="-ml-1 inline-flex min-h-[44px] items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {children}
    </Link>
  );
}

/** Mono uppercase meta line; empty segments are dropped. */
export function MetaLine({
  parts,
  className,
}: {
  parts: ReadonlyArray<string | number | null | undefined | false>;
  className?: string;
}) {
  const text = joinMeta(parts);
  if (!text) return null;
  return (
    <p className={cn("font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground", className)}>
      {text}
    </p>
  );
}

interface ReadingHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  meta?: ReadonlyArray<string | number | null | undefined | false>;
  /** Right-aligned controls in the title row (details sheet, report…). */
  actions?: ReactNode;
  /** Rendered under the meta line (author chip, narrator…). */
  children?: ReactNode;
}

export function ReadingHeader({ eyebrow, title, lede, meta, actions, children }: ReadingHeaderProps) {
  return (
    <header className="flex flex-col gap-4">
      {eyebrow && <span className={EYEBROW_CHIP}>{eyebrow}</span>}
      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 flex-1 font-display text-[clamp(34px,4.6vw,52px)] font-bold leading-[1.02] tracking-[-0.03em] text-foreground">
          {title}
        </h1>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {lede && <p className="text-lg leading-relaxed text-muted-foreground">{lede}</p>}
      {meta && <MetaLine parts={meta} />}
      {children}
    </header>
  );
}

export interface RelatedItem {
  href: string;
  title: string;
  description?: string | null;
  /** Small mono chip above the title (category, kind). */
  chip?: string | null;
  /** Mono footer line, e.g. "6 MIN READ". */
  meta?: string | null;
}

/** Related-content cards in the template-card style. Self-gates on empty. */
export function RelatedContentGrid({
  title,
  items,
  className,
}: {
  title: ReactNode;
  items: RelatedItem[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className={cn("flex flex-col gap-5", className)}>
      <h2 className="font-display text-[clamp(24px,2.6vw,32px)] font-bold tracking-[-0.03em] text-foreground">
        {title}
      </h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-4">
        {items.map((item) => (
          <li key={item.href} className="flex">
            <Link
              to={item.href}
              className={cn(
                CONTENT_CARD,
                "group flex w-full flex-col gap-2.5 p-5 transition-colors hover:border-primary/50",
              )}
            >
              {item.chip && <MonoChip className="self-start">{item.chip}</MonoChip>}
              <span className="line-clamp-2 text-[17px] font-semibold leading-snug text-foreground group-hover:text-primary">
                {item.title}
              </span>
              {item.description && (
                <span className="line-clamp-2 text-sm text-muted-foreground">{item.description}</span>
              )}
              <span className="mt-auto flex items-center justify-between gap-2 pt-1">
                {item.meta ? (
                  <span className="font-mono text-[11px] uppercase text-muted-foreground">{item.meta}</span>
                ) : (
                  <span />
                )}
                <ArrowRight
                  className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  aria-hidden="true"
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Accent call-to-action card used at the end of a reading page. */
export function ReadingCtaCard({
  title,
  body,
  action,
}: {
  title: ReactNode;
  body?: ReactNode;
  action: ReactNode;
}) {
  return (
    <aside className="flex flex-wrap items-center justify-between gap-5 rounded-[20px] bg-accent p-6">
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5">
        <p className="font-display text-xl font-bold tracking-tight text-accent-foreground">{title}</p>
        {body && <p className="text-[15px] text-accent-foreground/80">{body}</p>}
      </div>
      {action}
    </aside>
  );
}
