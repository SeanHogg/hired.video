/**
 * Sections tab of the kit panel: every editable résumé section with how
 * many entries it holds. Picking one opens its editor — the same editor the
 * pencil on the rendered page opens.
 */
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import type { ResumeContent } from "@shared/resume";
import {
  EDITABLE_RESUME_SECTIONS,
  sectionItemCount,
  sectionLabelKey,
} from "@/lib/build/editable-sections";

interface SectionsPanelProps {
  content: ResumeContent;
  onEdit: (sectionKey: string) => void;
}

export default function SectionsPanel({ content, onEdit }: SectionsPanelProps) {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-[13px] text-muted-foreground">{t("build.sections.hint")}</p>
      <ul className="flex flex-col gap-1.5">
        {EDITABLE_RESUME_SECTIONS.map((key) => {
          const count = sectionItemCount(content, key);
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onEdit(key)}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 text-left text-sm text-foreground transition-colors hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{t(sectionLabelKey(key))}</span>
                {count !== null && (
                  <span className="text-xs text-muted-foreground">{t("build.sections.count", { count })}</span>
                )}
                <ChevronRight aria-hidden="true" className="h-4 w-4 flex-none text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
