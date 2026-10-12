import { Link } from "react-router-dom";
import { FileText, Video, Package, Link as LinkIcon, Sparkles, Upload } from "lucide-react";
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
 * Source-type CTAs (markdown / SCORM zip / external URL) fire
 * `onPickSource` to open the lesson dialog with the source pre-selected.
 * The Studio CTA is an out-of-band `<Link>` to the storyboard wizard.
 * Bulk-import CTAs (`onGenerate` for #1497, `onImportPptx` for #1498)
 * fire their own callbacks because they produce multiple lesson rows
 * via the [commit-course-skeleton](../../lib/courses/commit-course-skeleton.ts)
 * walker, not a single-lesson dialog.
 */

interface Props {
  /** Active course id. `null` = course not yet saved → CTAs disabled. */
  courseId: string | null;
  /** Fired when the user picks one of the in-dialog source types. */
  onPickSource?: (sourceType: CourseLessonSourceType) => void;
  /** Open the AI course-generator dialog. Omit to hide that CTA. */
  onGenerate?: () => void;
  /** Open the .pptx file picker. Omit to hide that CTA. */
  onImportPptx?: () => void;
}

const DIALOG_CTAS: { sourceType: CourseLessonSourceType; label: string; icon: typeof FileText }[] = [
  { sourceType: "text_md",       label: "Write markdown lesson", icon: FileText },
  { sourceType: "scorm_package", label: "Upload SCORM package",  icon: Package  },
  { sourceType: "external_url",  label: "Link external URL",     icon: LinkIcon },
];

export default function LessonAuthoringCTAs({
  courseId,
  onPickSource,
  onGenerate,
  onImportPptx,
}: Props) {
  const disabled = courseId == null || !onPickSource;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {/* AI generator — bulk-add via #1497 commit walker. Rendered first
            so it leads the strip when the host wires it up. */}
        {onGenerate && (
          <Button size="sm" disabled={disabled} onClick={disabled ? undefined : onGenerate}>
            <Sparkles className="h-3.5 w-3.5 mr-1" /> AI generate course
          </Button>
        )}

        {/* PPTX importer — bulk-add via #1498 commit walker. */}
        {onImportPptx && (
          <Button size="sm" variant="outline" disabled={disabled} onClick={disabled ? undefined : onImportPptx}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Import .pptx
          </Button>
        )}

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
          link to existing content, or bulk-import from AI / PowerPoint.
        </p>
      )}
    </div>
  );
}
