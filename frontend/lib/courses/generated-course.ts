/** Course tree returned by `POST /api/courses/generate` (gap #162) —
 *  produced by CourseGeneratorDialog, committed by commit-course-skeleton. */

interface GeneratedScene {
  type: string;
  title: string;
  body: string;
  question?: string;
  options?: Array<{ id: string; text: string; isCorrect: boolean }>;
}
interface GeneratedLesson {
  title: string;
  summary: string;
  estimatedMinutes: number;
  scenes: GeneratedScene[];
}
interface GeneratedModule {
  title: string;
  summary: string;
  lessons: GeneratedLesson[];
}
export interface GeneratedCourse {
  title: string;
  description: string;
  estimatedMinutes: number;
  modules: GeneratedModule[];
}
