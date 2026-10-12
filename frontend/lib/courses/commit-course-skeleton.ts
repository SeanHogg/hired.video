// Commit walker for #1497 (AI generated course) + #1498 (PPTX import).
// Both flows produce a "course skeleton" — modules with text_md lessons —
// and need to commit that skeleton against `courseService.addModule` +
// `courseService.addLesson`. The two source-side folds (AI scenes →
// markdown, PPTX slides → markdown with thumbnail) live here too so the
// editor stays UI-only.

import { courseService, type CourseLesson, type CourseModule } from "@/lib/services/course-service";
import { uploadFile } from "@/lib/services/upload-service";
import type { GeneratedCourse } from "@/lib/courses/generated-course";
import type { PptxSlide } from "@/lib/courses/pptx-import";

export interface CourseSkeletonLesson {
  title: string;
  summary?: string;
  bodyMd: string;
  estimatedMinutes?: number;
}

export interface CourseSkeletonModule {
  title: string;
  summary?: string;
  lessons: CourseSkeletonLesson[];
}

export interface CourseSkeleton {
  modules: CourseSkeletonModule[];
}

export interface CommitResult {
  modules: CourseModule[];
  lessons: CourseLesson[];
}

/** Walk a skeleton and POST it as modules + lessons. Sort orders are
 *  computed from the existing tail so a generated tree appends after
 *  whatever the author already authored. Errors bubble — the caller is
 *  expected to wrap the call in a try/catch + toast. */
export async function commitCourseSkeleton(
  courseId: string,
  skeleton: CourseSkeleton,
  existingModuleCount: number,
): Promise<CommitResult> {
  const modules: CourseModule[] = [];
  const lessons: CourseLesson[] = [];
  for (let mi = 0; mi < skeleton.modules.length; mi++) {
    const m = skeleton.modules[mi];
    const mod = await courseService.addModule(courseId, {
      title: m.title,
      summary: m.summary,
      sortOrder: existingModuleCount + mi,
    });
    modules.push(mod);
    for (let li = 0; li < m.lessons.length; li++) {
      const l = m.lessons[li];
      const lesson = await courseService.addLesson(courseId, {
        title: l.title,
        summary: l.summary,
        moduleId: mod.id,
        sourceType: "text_md",
        bodyMd: l.bodyMd,
        estimatedMinutes: l.estimatedMinutes,
        sortOrder: li,
        isRequired: true,
      });
      lessons.push(lesson);
    }
  }
  return { modules, lessons };
}

/** AI generator → skeleton. Scenes fold into markdown sections; knowledge
 *  checks render as `> Q: …` blockquotes with `- [ ]` options so the
 *  author can convert them to a real `knowledge_check` form later. */
export function generatedCourseToSkeleton(gc: GeneratedCourse): CourseSkeleton {
  return {
    modules: gc.modules.map((m) => ({
      title: m.title,
      summary: m.summary || undefined,
      lessons: m.lessons.map((l) => ({
        title: l.title,
        summary: l.summary || undefined,
        estimatedMinutes: l.estimatedMinutes,
        bodyMd: l.scenes
          .map((scene) => {
            const headerLevel = scene.type === "summary" ? "##" : "###";
            const parts = [`${headerLevel} ${scene.title}`, scene.body];
            if (scene.question && scene.options) {
              parts.push("");
              parts.push(`> **Knowledge check:** ${scene.question}`);
              for (const opt of scene.options) {
                parts.push(`> - [ ] ${opt.text}${opt.isCorrect ? " *(answer)*" : ""}`);
              }
            }
            return parts.join("\n");
          })
          .join("\n\n"),
      })),
    })),
  };
}

/** Replace blob URLs in PPTX slides with permanent R2 URLs. Returns a
 *  map keyed by slide index. Errors per-slide are swallowed (we'd rather
 *  ship a lesson with no thumbnail than abort the whole import); the
 *  caller can surface a softer "X of N images uploaded" toast on the
 *  returned size. */
export async function uploadPptxThumbnails(slides: PptxSlide[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  for (const slide of slides) {
    if (!slide.thumbnailUrl) continue;
    try {
      const blob = await fetch(slide.thumbnailUrl).then((r) => r.blob());
      const ext = blob.type.split("/")[1] || "png";
      const file = new File([blob], `pptx-slide-${slide.index}.${ext}`, { type: blob.type });
      const url = await uploadFile(file);
      if (url) result.set(slide.index, url);
    } catch {
      // Per-slide failure is non-fatal.
    } finally {
      URL.revokeObjectURL(slide.thumbnailUrl);
    }
  }
  return result;
}

/** PPTX slides → skeleton. Embeds the uploaded thumbnail (if present)
 *  at the top of each lesson body as a markdown image. Speaker notes
 *  fold into a `> Speaker notes:` blockquote so authors can re-record
 *  the slide via the studio later (per #1498's slidesToCourseSkeleton). */
export function pptxSlidesToSkeleton(
  slides: PptxSlide[],
  uploadedThumbnails: Map<number, string>,
): CourseSkeleton {
  return {
    modules: [
      {
        title: "Imported slides",
        lessons: slides.map((s) => {
          const thumbnail = uploadedThumbnails.get(s.index);
          const parts: string[] = [];
          if (thumbnail) parts.push(`![Slide ${s.index}](${thumbnail})`);
          if (s.bullets.length > 0) parts.push(s.bullets.map((b) => `- ${b}`).join("\n"));
          if (s.notes) parts.push(`> **Speaker notes:** ${s.notes}`);
          return {
            title: s.title || `Slide ${s.index}`,
            bodyMd: parts.join("\n\n"),
          };
        }),
      },
    ],
  };
}
