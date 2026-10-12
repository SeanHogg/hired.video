/**
 * The open section editor in the kit panel. The fields come from the
 * shared declarative schema via the studio's SectionEditor, so the kit workspace edits
 * a résumé exactly the way every other field-bound editor does. Each change
 * replaces the draft in place (the page re-renders as you type; the draft
 * autosave saves it, debounced).
 */
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import type { ResumeContent } from "@shared/resume";
import SectionEditor from "@/components/studio/document/SectionEditor";
import { sectionLabelKey } from "@/lib/build/editable-sections";

interface SectionEditPanelProps {
  sectionKey: string;
  content: ResumeContent;
  onChange: (next: ResumeContent) => void;
  onClose: () => void;
}

export default function SectionEditPanel({ sectionKey, content, onChange, onClose }: SectionEditPanelProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={onClose}
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {t("build.edit.back")}
        </button>
        <h2 className="text-lg font-semibold text-foreground">{t(sectionLabelKey(sectionKey))}</h2>
        <p className="text-[13px] text-muted-foreground">{t("build.edit.hint")}</p>
      </div>
      <SectionEditor
        entityKind="resume"
        sectionKey={sectionKey}
        content={content}
        // SectionEditor rewrites only this section's key of the content it was given.
        onChange={(next) => onChange(next as ResumeContent)}
      />
    </>
  );
}
