import {
  GraduationCap,
  Calendar,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Education } from "@/types/resume";
import SectionEditButton from "./SectionEditButton";

interface EducationTimelineItemProps {
  institution: string;
  area: string;
  studyType: string;
  startDate: string;
  endDate: string;
  score?: string;
  courses?: string[] | null;
  isLast?: boolean;
}

function EducationTimelineItem({
  institution,
  area,
  studyType,
  startDate,
  endDate,
  score,
  courses,
  isLast = false,
}: EducationTimelineItemProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateString: string) => {
    if (!dateString || dateString === "Present") return dateString || t("labels.present");
    const dateObj = new Date(dateString);
    if (isNaN(dateObj.getTime())) return dateString;
    return dateObj.toLocaleDateString("en-US", { year: "numeric", month: "short" });
  };

  const title = studyType && area
    ? t("labels.studyTypeIn", { studyType, area })
    : area || studyType || t("tabs.education");

  return (
    <div className="relative">
      {!isLast && (
        <div className="absolute left-6 top-12 w-0.5 h-full bg-gradient-to-b from-blue-500 to-blue-500/20" />
      )}
      <div
        className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-shrink-0 w-12 h-12 bg-blue-50 dark:bg-blue-950 rounded-full flex items-center justify-center relative z-10">
          <GraduationCap className="w-6 h-6 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-lg leading-tight">{title}</h3>
              <p className="text-blue-600 font-medium">{institution}</p>
              {score && (
                <p className="text-sm text-muted-foreground">{t("labels.gpa", { score })}</p>
              )}
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>{t("labels.dateRangeWithSeparator", { start: formatDate(startDate), end: formatDate(endDate) })}</span>
              </div>
              {courses && courses.length > 0 && (
                <ChevronRight
                  className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
                />
              )}
            </div>
          </div>
          {expanded && courses && courses.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                {t("headings.courses")}
              </h4>
              <ul className="space-y-1">
                {courses.map((course, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                    <span>{course}</span>
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

interface EducationSectionProps {
  education: Education[];
  isOwner: boolean;
  onEdit?: () => void;
}

export default function EducationSection({ education, isOwner, onEdit }: EducationSectionProps) {
  const { t } = useTranslation();
  if (education.length === 0 && !isOwner) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          {t("tabs.education")}
        </CardTitle>
        {isOwner && onEdit && (
          <SectionEditButton onClick={onEdit} label={t("actions.editEducation")} />
        )}
      </CardHeader>
      <CardContent>
        {education.length > 0 ? (
          <div className="space-y-1">
            {education.map((item, index) => (
              <EducationTimelineItem
                key={item.id || index}
                institution={item.institution}
                area={item.area}
                studyType={item.studyType}
                startDate={item.startDate}
                endDate={item.endDate || "Present"}
                score={item.score}
                courses={item.courses}
                isLast={index === education.length - 1}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {t("messages.educationEmpty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
