// Curriculum rail for /learn/:enrollmentId: modules in order, each with its
// lessons; unfiled lessons last. Each row shows pass state + lesson type and
// selects the active lesson.

import { CheckCircle2, Circle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { CourseLesson, LessonProgress } from "@/lib/services/course-service";
import { LESSON_SOURCE_ICON } from "./lesson-meta";

interface RailModule {
  id: string;
  title: string;
  sortOrder: number;
}

interface CurriculumRailProps {
  modules: RailModule[];
  lessonsByModule: Map<string | null, CourseLesson[]>;
  progress: Record<string, LessonProgress> | null | undefined;
  activeLessonId: string | null;
  onSelect: (lessonId: string) => void;
  totalLessons: number;
}

export default function CurriculumRail({
  modules,
  lessonsByModule,
  progress,
  activeLessonId,
  onSelect,
  totalLessons,
}: CurriculumRailProps) {
  const { t } = useTranslation();
  const unfiled = lessonsByModule.get(null) ?? [];

  const group = (key: string, heading: string, lessons: CourseLesson[]) => (
    <div key={key} className="flex flex-col gap-1">
      <div className="px-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{heading}</div>
      <ul className="flex flex-col gap-0.5">
        {lessons.map((l) => (
          <LessonRailItem
            key={l.id}
            lesson={l}
            progress={progress?.[l.id]}
            active={activeLessonId === l.id}
            onSelect={() => onSelect(l.id)}
          />
        ))}
      </ul>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 rounded-[20px] border border-border bg-card p-3">
      {modules
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((m, idx) => group(m.id, `${idx + 1}. ${m.title}`, lessonsByModule.get(m.id) ?? []))}
      {unfiled.length > 0 && group("__unfiled", t("labels.courseLearner.otherLessons"), unfiled)}
      {totalLessons === 0 && (
        <div className="p-4 text-center text-sm text-muted-foreground">{t("messages.courseLearner.noLessonsYet")}</div>
      )}
    </div>
  );
}

function LessonRailItem({
  lesson,
  progress,
  active,
  onSelect,
}: {
  lesson: CourseLesson;
  progress: LessonProgress | undefined;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const Icon = LESSON_SOURCE_ICON[lesson.sourceType];
  const passed = progress?.status === "passed";
  const ariaLabel = `${lesson.title}${passed ? ` ${t("labels.courseLearner.railCompletedSuffix")}` : ""}${lesson.isRequired ? "" : ` ${t("labels.courseLearner.railOptionalSuffix")}`}`;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        aria-label={ariaLabel}
        className={cn(
          // #1503 — visible focus ring so keyboard learners can see which
          // lesson they're about to activate.
          "flex min-h-[44px] w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          active && "bg-accent text-accent-foreground hover:bg-accent",
        )}
      >
        {passed ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-green-text" aria-hidden="true" />
        ) : (
          <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 truncate text-sm font-medium">{lesson.title}</span>
        {!lesson.isRequired && (
          <span className="font-mono text-[10px] uppercase text-muted-foreground">{t("labels.courseLearner.optional")}</span>
        )}
      </button>
    </li>
  );
}
