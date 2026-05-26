import { Link } from "react-router-dom";
import { FileText, Video, Package, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CourseLessonSourceType } from "@/lib/services/course-service";

/**
 * LessonAuthoringCTAs — the primary entry-point strip for adding lessons
 * to a course. Surfaced in two places per the two-step course-author flow:
 *
 *   • [CoursesManagerPanel](./CoursesManagerPanel.tsx) Step 2 placeholder
 *     when the course hasn't been saved yet (`courseId == null`).
 *   • [CourseContentEditor](./CourseContentEditor.tsx) header once the
 *     course has been saved and lessons can be attached.
 *
 * Self-gates on `courseId` per the DRY rule — consumers pass the actual
 * id, not a `canAddLessons` boolean. When `courseId == null` every CTA
 * renders disabled with a "save the draft first" hint underneath.
 *
 * The Studio CTA is a `<Link>` to the storyboard wizard (`?contentTemplate=
 * course-lesson-explainer`) because authoring a video happens out-of-band
 * — the Save → "Save as Course Lesson" handoff back in Studio binds the
 * resulting project to a lesson row. The three in-product source types
 * (markdown / SCORM zip / external URL) fire `onPickSource` so the host
 * editor can open its lesson dialog with the source type pre-selected.
 */

interface Props {
  /** Active course id. `null` = course not yet saved → CTAs disabled. */
  courseId: string | null;
  /** Fired when the user picks one of the in-dialog source types. Required
   *  for the dialog-opening CTAs to function; the Studio link does not
   *  need it. Omit alongside `courseId={null}` for the placeholder render. */
  onPickSource?: (sourceType: CourseLessonSourceType) => void;
}

const DIALOG_CTAS: { sourceType: CourseLessonSourceType; label: string; icon: typeof FileText }[] = [
  { sourceType: "text_md",       label: "Write markdown lesson", icon: FileText },
  { sourceType: "scorm_package", label: "Upload SCORM package",  icon: Package  },
  { sourceType: "external_url",  label: "Link external URL",     icon: LinkIcon },
];

export default function LessonAuthoringCTAs({ courseId, onPickSource }: Props) {
  const disabled = courseId == null || !onPickSource;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {/* Studio video — out-of-band authoring; opens /studio with the
            course-lesson storyboard preset. Disabled when no course id
            because the saved-back lesson row needs a course to attach to. */}
        {disabled ? (
          <Button size="sm" variant="outline" disabled>
            <Video className="h-3.5 w-3.5 mr-1" /> Author Studio video
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link to="/studio?contentTemplate=course-lesson-explainer">
              <Video className="h-3.5 w-3.5 mr-1" /> Author Studio video
            </Link>
          </Button>
        )}

        {DIALOG_CTAS.map(({ sourceType, label, icon: Icon }) => (
          <Button
            key={sourceType}
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={disabled ? undefined : () => onPickSource!(sourceType)}
          >
            <Icon className="h-3.5 w-3.5 mr-1" /> {label}
          </Button>
        ))}
      </div>
      {disabled && (
        <p className="text-xs text-muted-foreground">
          Save the course details below to start adding lessons. You can
          write markdown, record a Studio video, upload a SCORM package,
          or link to existing content.
        </p>
      )}
    </div>
  );
}
