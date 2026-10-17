import {
  Building,
  Calendar,
  ChevronRight,
  Briefcase,
} from "lucide-react";
import { useState } from "react";
import { formatMonthYear } from "@/lib/format";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { workEntryTags, type Work, type WorkEntryTag } from "@/types/resume";
import SectionEditButton from "./SectionEditButton";

interface TimelineItemProps {
  title: string;
  subtitle: string;
  startDate: string;
  endDate: string;
  description?: string;
  highlights?: string[];
  /** Employment / location chips (already resolved to i18n keys). */
  tags?: WorkEntryTag[];
  isLast?: boolean;
}

function TimelineItem({
  title,
  subtitle,
  startDate,
  endDate,
  description,
  highlights,
  tags,
  isLast = false,
}: TimelineItemProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const formattedStart = formatMonthYear(startDate, t("labels.present"));
  const formattedEnd = formatMonthYear(endDate, t("labels.present"));

  return (
    <div className="relative">
      {!isLast && (
        <div className="absolute left-6 top-12 w-0.5 h-full bg-primary" />
      )}
      <div
        className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center relative z-10">
          <Building className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-lg leading-tight">{title}</h3>
              <p className="text-primary font-medium">{subtitle}</p>
              {tags && tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag.key}
                      className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                    >
                      {t(tag.key)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>{t("labels.dateRangeWithSeparator", { start: formattedStart, end: formattedEnd })}</span>
              </div>
              <ChevronRight
                className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
              />
            </div>
          </div>
          {description && (
            <p className="text-muted-foreground mt-2">{description}</p>
          )}
          {expanded && highlights && highlights.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                {t("headings.keyAchievements")}
              </h4>
              <ul className="space-y-2">
                {highlights.map((highlight, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ExperienceSectionProps {
  work: Work[];
  isOwner: boolean;
  onEdit?: () => void;
}

export default function ExperienceSection({ work, isOwner, onEdit }: ExperienceSectionProps) {
  const { t } = useTranslation();
  if (work.length === 0 && !isOwner) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          {t("headings.experience")}
        </CardTitle>
        {isOwner && onEdit && (
          <SectionEditButton onClick={onEdit} label={t("actions.editExperience")} />
        )}
      </CardHeader>
      <CardContent>
        {work.length > 0 ? (
          <div className="space-y-1">
            {work.map((item, index) => (
              <TimelineItem
                key={item.id || index}
                title={item.position}
                subtitle={item.name}
                startDate={item.startDate}
                endDate={item.endDate || "Present"}
                description={item.summary}
                highlights={item.highlights}
                tags={workEntryTags(item)}
                isLast={index === work.length - 1}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {t("messages.experienceEmpty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
