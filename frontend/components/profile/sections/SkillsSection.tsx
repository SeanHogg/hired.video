import { Award } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SectionEditButton from "./SectionEditButton";

interface SkillsSectionProps {
  /** Free-text SEO keywords stored on the profile (separate from resume skills). */
  keywords?: string[];
  /** Industries the owner identifies with. Curated list + optional custom values. */
  industries?: string[];
  isOwner: boolean;
  onEdit?: () => void;
  title?: string;
}

export default function SkillsSection({
  keywords,
  industries,
  isOwner,
  onEdit,
  title,
}: SkillsSectionProps) {
  const { t } = useTranslation();
  const hasKeywords = keywords && keywords.length > 0;
  const hasIndustries = industries && industries.length > 0;
  const hasAnything = hasKeywords || hasIndustries;

  if (!hasAnything && !isOwner) return null;

  const sectionTitle = title ?? t("messages.discoverabilityTags");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5" />
          {sectionTitle}
        </CardTitle>
        {isOwner && onEdit && <SectionEditButton onClick={onEdit} label={t("actions.editDiscoverability")} />}
      </CardHeader>
      <CardContent className="space-y-5">
        {hasIndustries && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              {t("headings.industries")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {industries!.map((industry) => (
                <Badge key={industry} variant="outline">
                  {industry}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {hasKeywords && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              {t("headings.seoKeywords")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {keywords!.map((keyword) => (
                <Badge key={keyword} variant="secondary">
                  {keyword}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {!hasAnything && isOwner && (
          <p className="text-sm text-muted-foreground italic">
            {t("messages.discoverabilityEmpty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
