import { useTranslation } from "react-i18next";
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
  /** Section name for the accessible label ("Edit <name>"); defaults to the
   *  translated section name (`tabs.<sectionKey>`). */
  sectionName?: string;
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
  sectionName,
}: Props) {
  const { t } = useTranslation();
  if (!isOwner || !onEditSection) return null;
  const label = t("actions.editSectionNamed", {
    section: sectionName ?? t(`tabs.${sectionKey}`, { defaultValue: sectionKey }),
  });
  // Subtle grey ghost pencil — the app-wide standard for section-edit
  // affordances (matches SectionEditButton on the profile sections).
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      onClick={(e) => {
        e.stopPropagation();
        onEditSection(sectionKey);
      }}
      aria-label={label}
      title={label}
    >
      <Pencil className="h-4 w-4" />
    </Button>
  );
}
