import { Copy } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { publicResumePath } from "@shared/public-paths";
import { Badge } from "@/components/ui/badge";
import type { ResumeWithOwnership } from "@/types/resume";

/**
 * Variant previews — only rendered when a resume is a parent. The
 * one-level hierarchy means a variant card never shows this slider.
 */
export default function ResumeVariationsSlider({
  variations,
}: {
  variations: ResumeWithOwnership[];
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("resumeCard.variationsCount", { count: variations.length })}
        </h4>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        {variations.map((child) => (
          <Link
            key={child.id}
            to={publicResumePath(child.id)}
            className="snap-start shrink-0 w-48 rounded-md border bg-background hover:bg-muted/40 transition-colors p-3 flex flex-col gap-1"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-medium truncate" title={child.title}>
                {child.title}
              </span>
              {child.isActive && (
                <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-800 shrink-0">
                  {t("resumeCard.active")}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Copy className="w-3 h-3" />
              <span>
                {typeof child.diffPercent === "number"
                  ? t("resumeCard.diffPercent", { percent: child.diffPercent })
                  : t("resumeCard.variation")}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
