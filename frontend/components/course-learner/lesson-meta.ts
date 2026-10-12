// Per-lesson-type icon + label key, shared by the curriculum rail and the
// active-lesson header on /learn/:enrollmentId.

import { ExternalLink, FileText, Package, Video } from "lucide-react";
import type { CourseLessonSourceType } from "@/lib/services/course-service";

export const LESSON_SOURCE_ICON: Record<CourseLessonSourceType, typeof FileText> = {
  text_md: FileText,
  studio_video: Video,
  scorm_package: Package,
  external_url: ExternalLink,
};

// Stable i18n keys resolved at render with t(); never call t() at module scope.
export const LESSON_TYPE_LABEL_KEY: Record<CourseLessonSourceType, string> = {
  text_md: "labels.courseLearner.lessonType.reading",
  studio_video: "labels.courseLearner.lessonType.video",
  scorm_package: "labels.courseLearner.lessonType.scorm",
  external_url: "labels.courseLearner.lessonType.externalLink",
};
