import {
  GraduationCap,
  Calendar,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
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
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateString: string) => {
    if (!dateString || dateString === "Present") return dateString || "Present";
    const dateObj = new Date(dateString);
    if (isNaN(dateObj.getTime())) return dateString;
    return dateObj.toLocaleDateString("en-US", { year: "numeric", month: "short" });
  };

  const title = studyType && area ? `${studyType} in ${area}` : area || studyType || "Education";

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
                <p className="text-sm text-muted-foreground">GPA: {score}</p>
              )}
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(startDate)} - {formatDate(endDate)}</span>
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
                Courses
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
  if (education.length === 0 && !isOwner) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          Education
        </CardTitle>
        {isOwner && onEdit && (
          <SectionEditButton onClick={onEdit} label="Edit education" />
        )}
      </CardHeader>
      <CardContent>
        {education.length > 0 ? (
          <div className="space-y-1">
            {education.map((item, index) => (
              <EducationTimelineItem
                key={item.Id || index}
                institution={item.Institution}
                area={item.Area}
                studyType={item.StudyType}
                startDate={item.StartDate}
                endDate={item.EndDate || "Present"}
                score={item.Score}
                courses={item.Courses}
                isLast={index === education.length - 1}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No education added yet. Edit your master resume to add education.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
