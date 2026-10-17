// Resume-only side affordance — picks which resume the marketplace preview
// renders the descriptor against (sample vs. one of the visitor's resumes).
//
// Self-gating: returns null unless the meta is a resume template, so any
// surface can drop <ResumeSourceSelector ... /> without first checking the
// kind itself. Equally returns null for anonymous visitors — they have no
// resumes to choose from, so the dropdown would be a one-option no-op.

import { FileText } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { useUserResumes } from "@/hooks/queries/use-resumes";
import { isResumeTemplate, type TemplateMeta } from "@/lib/templates/types";

export interface ResumeSourceSelectorProps {
  meta: TemplateMeta;
  /** Currently-selected resume id, or "sample". */
  value: string;
  onChange: (next: string) => void;
}

export default function ResumeSourceSelector({ meta, value, onChange }: ResumeSourceSelectorProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const isResume = isResumeTemplate(meta);
  const { data: userResumes = [] } = useUserResumes({ enabled: isResume });

  // Default the preview to the visitor's master (else first) résumé — once,
  // when the list first lands, so a later "sample" pick isn't overridden.
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || !isResume || userResumes.length === 0) return;
    defaulted.current = true;
    const master = userResumes.find(
      (r: any) => r.isMaster === true || r.IsMaster === true,
    );
    const def = master ?? userResumes[0];
    const defId: string = (def as any).id ?? (def as any).Id;
    if (value === "sample") onChange(defId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResume, userResumes]);

  if (!isResume || !isAuthenticated) return null;

  const label = (() => {
    if (value === "sample") return t("templates.source.sample");
    const match = userResumes.find((r: any) => (r.id ?? r.Id) === value) as any | undefined;
    return match?.title || match?.Title || t("templates.source.yours");
  })();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" aria-label={t("templates.source.aria", { name: label })}>
          <FileText className="w-4 h-4 mr-1" />
          <span className="max-w-[160px] truncate">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          {t("templates.source.menuLabel")}
        </DropdownMenuLabel>
        {userResumes.map((r: any) => {
            const rid: string = r.id ?? r.Id;
            const title: string = r.title ?? r.Title ?? t("templates.source.untitled");
            const isMaster = r.isMaster === true || r.IsMaster === true;
            return (
              <DropdownMenuItem
                key={rid}
                onClick={() => onChange(rid)}
                className={value === rid ? "bg-accent" : ""}
              >
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-medium truncate">{title}</span>
                  {isMaster && (
                    <span className="text-xs text-muted-foreground">{t("templates.source.master")}</span>
                  )}
                </div>
              </DropdownMenuItem>
            );
          })}
        <DropdownMenuItem
          onClick={() => onChange("sample")}
          className={value === "sample" ? "bg-accent" : ""}
        >
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-medium truncate">{t("templates.source.sample")}</span>
            <span className="text-xs text-muted-foreground">{t("templates.source.sampleHint")}</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
