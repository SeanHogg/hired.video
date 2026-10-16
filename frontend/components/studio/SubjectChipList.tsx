/**
 * SubjectChipList — many-to-many version of SubjectChip. Renders one
 * inline chip per linked entity, each with an optional `×` to unlink,
 * plus an `onAdd?` hint surface for callers that want to wire in their
 * own picker.
 *
 * Self-contained per the DRY rule:
 *   • Returns null when there's nothing to render AND nothing the user
 *     can do (no subjects + no add handler).
 *   • Each chip uses the same icon/href/noun mapping as the legacy
 *     single SubjectChip — defined once in shared/studio-subject.ts +
 *     lib/studio/subject-icon.ts.
 *
 * Drops into the active Recent row to replace the single SubjectChip.
 */

import { Link } from "react-router-dom";
import { Plus, X } from "lucide-react";
import {
  STUDIO_SUBJECT_NOUN,
  studioSubjectHref,
  type StudioSubjectKind,
} from "@shared/studio-subject";
import { getStudioSubjectIcon } from "@/lib/studio/subject-icon";
import { cn } from "@/lib/utils";

interface ChipSubject {
  kind: StudioSubjectKind | string;
  id: string;
}

interface SubjectChipListProps {
  subjects: ChipSubject[];
  /** Show an `×` on each chip and call this when clicked. Omit to render
   *  read-only chips (e.g. on non-active sidebar rows). */
  onUnlink?: (subject: { kind: StudioSubjectKind; id: string }) => void;
  /** Render a `+ Link` chip after the existing ones. Omit to hide. */
  onAdd?: () => void;
  className?: string;
}

const KNOWN_KINDS: ReadonlySet<StudioSubjectKind> = new Set([
  "resume",
  "profile",
  "job",
  "company",
  "skills_demo",
  "creator_credit",
  "talent_pool_candidate",
]);

export default function SubjectChipList({
  subjects,
  onUnlink,
  onAdd,
  className,
}: SubjectChipListProps) {
  // De-dupe + filter to known kinds in one pass so the consumer doesn't
  // have to remember either rule.
  const seen = new Set<string>();
  const items = subjects.flatMap((s) => {
    if (!KNOWN_KINDS.has(s.kind as StudioSubjectKind)) return [];
    const key = `${s.kind}:${s.id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ kind: s.kind as StudioSubjectKind, id: s.id }];
  });

  if (items.length === 0 && !onAdd) return null;

  return (
    <div className={cn("flex items-center flex-wrap gap-1", className)}>
      {items.map((s) => {
        const Icon = getStudioSubjectIcon(s.kind);
        const noun = STUDIO_SUBJECT_NOUN[s.kind];
        const href = studioSubjectHref(s);
        const labelEl = (
          <span
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
            title={`View linked ${noun}`}
          >
            <Icon className="w-3 h-3" />
            {noun}
          </span>
        );
        return (
          <span
            key={`${s.kind}:${s.id}`}
            className="inline-flex items-center gap-0.5 rounded bg-muted/40 px-1 py-0.5"
          >
            {href ? (
              <Link to={href} onClick={(e) => e.stopPropagation()} className="inline-block">
                {labelEl}
              </Link>
            ) : (
              labelEl
            )}
            {onUnlink && (
              <button
                type="button"
                title={`Unlink ${noun}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onUnlink(s);
                }}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </span>
        );
      })}
      {onAdd && (
        <button
          type="button"
          title="Link another entity"
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className="inline-flex items-center gap-0.5 rounded border border-dashed border-muted-foreground/40 px-1 py-0.5 text-[10px] text-muted-foreground hover:text-primary hover:border-primary/60 transition-colors"
        >
          <Plus className="w-2.5 h-2.5" />
          Link
        </button>
      )}
    </div>
  );
}
