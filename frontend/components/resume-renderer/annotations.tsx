/**
 * Review annotations on the rendered résumé page — the layer the kit's merge,
 * tailor and create-from-a-job reviews draw on the page itself.
 *
 * An annotation is keyed by a content path (shared/resume-path.ts:
 * `basics.label`, `work.2`, `work.2.highlights.1`, `skills`) and says how
 * that piece of the page reads in the review:
 *
 *   added / new    text the change adds        (green, underlined)
 *   changed        new text, with `before` struck out in front of it
 *   removed        text the change drops       (red, struck)
 *   review         needs the person            (amber ring)
 *   pin            a numbered change marker
 *
 * plus optional `card` / `cardAfter` slots: a control anchored to that spot
 * (a merge decision above an entry, a gap question after one), `chips`
 * (requirement ids), and `removedItems` (bullets a change dropped).
 *
 * The renderer stays presentational: it only reads this context. Who builds
 * the annotations, and what the cards do, belongs to the review session.
 * With no provider, every wrapper renders its children untouched.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isWithin, type ContentPath } from "@shared/resume-path";
import { EditableText } from "./inline-edit";
import { RESUME_ITEM_ID_ATTR } from "@/lib/studio/document/resume-media-binding";

export type AnnotationKind = "added" | "new" | "changed" | "removed" | "review" | "pin";

export interface ResumeAnnotation {
  kind: AnnotationKind;
  /** Numbered change marker (tailor pins, merge queue numbers). */
  pin?: number;
  /** The original text a `changed` annotation replaced. */
  before?: string;
  /** Rendered before the annotated element (merge decision cards). */
  card?: ReactNode;
  /** Rendered after the annotated element (gap questions, pin popovers). */
  cardAfter?: ReactNode;
  /** Bullets the change dropped from this entry, shown struck. */
  removedItems?: readonly string[];
  /** Small tags, e.g. the requirements a bullet proves ("R1", "R3"). */
  chips?: readonly string[];
  /** The change currently selected (compare panel / pin popover). */
  active?: boolean;
}

export type ResumeAnnotations = Readonly<Record<ContentPath, ResumeAnnotation>>;

const AnnotationsContext = createContext<ResumeAnnotations | null>(null);

export function ResumeAnnotationsProvider({ value, children }: { value?: ResumeAnnotations; children: ReactNode }) {
  return <AnnotationsContext.Provider value={value ?? null}>{children}</AnnotationsContext.Provider>;
}

export function useAnnotation(path: ContentPath | undefined): ResumeAnnotation | undefined {
  const all = useContext(AnnotationsContext);
  return path && all ? all[path] : undefined;
}

/** True when anything under `path` is annotated (a collapsed timeline entry
 *  opens so its annotated bullets are visible). */
export function useHasAnnotationsWithin(path: ContentPath | undefined): boolean {
  const all = useContext(AnnotationsContext);
  return useMemo(() => !!path && !!all && Object.keys(all).some((p) => isWithin(p, path)), [all, path]);
}

const TEXT_CLASS: Record<AnnotationKind, string> = {
  added: "rounded-[3px] bg-diff-added px-0.5 text-diff-added-foreground underline decoration-2 underline-offset-[3px]",
  new: "rounded-[3px] bg-diff-added px-0.5 text-diff-added-foreground underline decoration-2 underline-offset-[3px]",
  changed: "rounded-[3px] bg-diff-added px-0.5 text-diff-added-foreground underline decoration-2 underline-offset-[3px]",
  removed: "rounded-[3px] bg-diff-removed px-0.5 text-diff-removed-foreground line-through",
  review: "rounded-[3px] bg-review px-0.5 text-review-foreground",
  pin: "",
};

function Pin({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="mr-1 inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-primary px-1 align-[2px] text-[11px] font-bold leading-none text-primary-foreground"
    >
      {n}
    </span>
  );
}

function Chips({ chips }: { chips?: readonly string[] }) {
  if (!chips?.length) return null;
  return (
    <>
      {chips.map((c) => (
        <span
          key={c}
          className="ml-1 inline-flex items-center rounded-full bg-accent px-1.5 py-0.5 align-[2px] font-sans text-[10.5px] font-semibold leading-none text-accent-foreground"
        >
          {c}
        </span>
      ))}
    </>
  );
}

/**
 * Line targets — opt-in (the kit's résumé page): every annotated-text spot
 * also marks its words with `data-content-path` so a click can say which
 * line it was (lib/workspace/kit/kit-line-ref.ts), and the selected line is
 * highlighted. Off (no provider) the page renders exactly as before.
 */
const LineTargetsContext = createContext<{ selectedPath: ContentPath | null } | null>(null);

export function ResumeLineTargets({ selectedPath, children }: { selectedPath: ContentPath | null; children: ReactNode }) {
  const value = useMemo(() => ({ selectedPath }), [selectedPath]);
  return <LineTargetsContext.Provider value={value}>{children}</LineTargetsContext.Provider>;
}

function LineWords({ path, className, children }: { path?: ContentPath; className?: string; children: ReactNode }) {
  const targets = useContext(LineTargetsContext);
  if (!targets || !path) return className ? <span className={className}>{children}</span> : <>{children}</>;
  return (
    <span
      data-content-path={path}
      className={cn(
        "cursor-pointer rounded-[3px] hover:bg-primary/10",
        targets.selectedPath === path && "bg-primary/15 outline outline-2 outline-offset-1 outline-primary",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A piece of text on the page (a field or one bullet). */
export function AnnotatedText({ path, children: shown }: { path?: ContentPath; children: ReactNode }) {
  const a = useAnnotation(path);
  // In the page's inline-edit mode a text field edits in place (inline-edit.tsx).
  const children = <EditableText path={path}>{shown}</EditableText>;
  if (!a) return <LineWords path={path}>{children}</LineWords>;
  return (
    <>
      {a.card}
      <span data-annot-path={path} className={cn(a.active && "rounded-sm outline outline-2 outline-offset-2 outline-primary")}>
        {a.pin !== undefined && <Pin n={a.pin} />}
        {a.kind === "changed" && a.before ? (
          <>
            <del className={TEXT_CLASS.removed}>{a.before}</del>{" "}
          </>
        ) : null}
        <LineWords path={path} className={TEXT_CLASS[a.kind]}>{children}</LineWords>
        <Chips chips={a.chips} />
      </span>
      {a.cardAfter}
    </>
  );
}

/** One entry (a role, a degree, a skill group) or a whole section.
 *  `itemId` (the entry's stable id) marks the entry so a media drop on the
 *  page can bind to it (lib/studio/document/resume-media-binding.ts). */
export function AnnotatedBlock({ path, children, className, itemId }: { path?: ContentPath; children: ReactNode; className?: string; itemId?: string }) {
  const a = useAnnotation(path);
  const mark = itemId ? { [RESUME_ITEM_ID_ATTR]: itemId } : undefined;
  if (!a) return <div className={className} {...mark}>{children}</div>;
  return (
    <div className={className} {...mark}>
      {a.card}
      <div
        data-annot-path={path}
        className={cn(
          "rounded-md",
          a.kind === "review" && "ring-[1.5px] ring-review-border ring-offset-4 ring-offset-card",
          (a.kind === "new" || a.kind === "added") && "ring-[1.5px] ring-diff-added-foreground/50 ring-offset-4 ring-offset-card",
          a.active && "outline outline-2 outline-offset-4 outline-primary",
        )}
      >
        {a.pin !== undefined && <Pin n={a.pin} />}
        {children}
        <Chips chips={a.chips} />
        {a.removedItems && a.removedItems.length > 0 && (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {a.removedItems.map((r) => (
              <li key={r}>
                <del className={TEXT_CLASS.removed}>{r}</del>
              </li>
            ))}
          </ul>
        )}
      </div>
      {a.cardAfter}
    </div>
  );
}

/** Just the anchored cards of `path`, for a spot with no text of its own
 *  (the résumé header's decision cards sit under the name). */
export function AnnotationCards({ path }: { path: ContentPath }) {
  const a = useAnnotation(path);
  if (!a?.card && !a?.cardAfter) return null;
  return (
    <div className="mx-auto my-3 max-w-2xl text-left font-sans">
      {a.card}
      {a.cardAfter}
    </div>
  );
}
