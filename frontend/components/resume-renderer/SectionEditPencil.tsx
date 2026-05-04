import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** Whether the viewer owns the resume. Component returns null otherwise. */
  isOwner: boolean;
  /** Handler — called with `sectionKey`. Component returns null when absent. */
  onEditSection?: (key: string) => void;
  /** Section identifier passed back to onEditSection. Maps to ResumeBuilder
   *  tab keys ("basics", "work", "skills", …) when the consumer routes to
   *  the editor. */
  sectionKey: string;
  /** Accessible label, e.g. "Edit work experience". */
  label: string;
}

/**
 * Self-gating pencil button for resume section headings. Renders nothing when
 * the viewer isn't the owner or no edit handler is wired, so callers don't
 * have to repeat the `isOwner && onEditSection && …` ternary at every site.
 */
export default function SectionEditPencil({
  isOwner,
  onEditSection,
  sectionKey,
  label,
}: Props) {
  if (!isOwner || !onEditSection) return null;
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className="h-8 w-8"
      onClick={(e) => {
        e.stopPropagation();
        onEditSection(sectionKey);
      }}
      aria-label={label}
    >
      <Pencil className="h-4 w-4" />
    </Button>
  );
}
