/**
 * SubjectChip — clickable badge that says "this video is about <noun>"
 * and links to the source entity. Self-contained: returns null when no
 * subject is bound, so callers drop it in unconditionally and trust it.
 *
 * Used inline on the active project row in StudioSidebar so users can
 * see at a glance which resume / job / profile / company a project is
 * linked to and bounce to that entity in one click.
 *
 * Per the DRY rule: icon + href + label all come from the shared
 * helpers (`shared/studio-subject.ts` + `lib/studio/subject-icon.ts`).
 * Adding a new subject kind is one edit per helper, zero edits here.
 */

import { Link } from "react-router-dom";
import {
  STUDIO_SUBJECT_NOUN,
  studioSubjectHref,
  type StudioSubjectKind,
} from "@shared/studio-subject";
import { getStudioSubjectIcon } from "@/lib/studio/subject-icon";
import { cn } from "@/lib/utils";

interface SubjectChipProps {
  /** When either field is missing the chip hides itself. */
  subjectKind?: StudioSubjectKind | string | null;
  subjectId?: string | null;
  className?: string;
}

const KNOWN_KINDS: ReadonlySet<StudioSubjectKind> = new Set([
  "resume",
  "profile",
  "job",
  "company",
  "skills_demo",
]);

export default function SubjectChip({ subjectKind, subjectId, className }: SubjectChipProps) {
  if (!subjectKind || !subjectId) return null;
  if (!KNOWN_KINDS.has(subjectKind as StudioSubjectKind)) return null;
  const kind = subjectKind as StudioSubjectKind;

  const Icon = getStudioSubjectIcon(kind);
  const noun = STUDIO_SUBJECT_NOUN[kind];
  const href = studioSubjectHref({ kind, id: subjectId });

  const inner = (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors",
        className,
      )}
      title={`View linked ${noun}`}
    >
      <Icon className="w-3 h-3" />
      {noun}
    </span>
  );

  if (!href) return inner;

  return (
    <Link
      to={href}
      onClick={(e) => e.stopPropagation()}
      className="inline-block"
    >
      {inner}
    </Link>
  );
}
