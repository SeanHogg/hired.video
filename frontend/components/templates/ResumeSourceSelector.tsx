// Resume-only side affordance — picks which resume the marketplace preview
// renders the descriptor against (sample vs. one of the visitor's resumes).
//
// Self-gating: returns null unless the meta is a resume template, so any
// surface can drop <ResumeSourceSelector ... /> without first checking the
// kind itself. Equally returns null for anonymous visitors — they have no
// resumes to choose from, so the dropdown would be a one-option no-op.

import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
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
import { resumeService, type ResumeSummary } from "@/lib/services/resume-service";
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
  const [userResumes, setUserResumes] = useState<ResumeSummary[]>([]);
  const isResume = isResumeTemplate(meta);

  useEffect(() => {
    if (!isResume || !isAuthenticated) {
      setUserResumes([]);
      return;
    }
    let cancelled = false;
    resumeService
      .getUserResumes()
      .then((rs) => {
        if (cancelled) return;
        setUserResumes(rs ?? []);
        const master = (rs ?? []).find(
          (r: any) => r.isMaster === true || r.IsMaster === true,
        );
        const def = master ?? (rs ?? [])[0];
        if (!def) return;
        const defId: string = (def as any).id ?? (def as any).Id;
        if (value === "sample") onChange(defId);
      })
      .catch(() => {
        if (!cancelled) setUserResumes([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResume, isAuthenticated]);

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
