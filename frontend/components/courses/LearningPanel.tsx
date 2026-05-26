import { useEffect, useState } from "react";
import { GraduationCap, Loader2, ArrowRight, Plus, Video } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CourseMarketplaceCard, {
  type CourseMarketplaceItem,
} from "@/components/CourseMarketplaceCard";
import { courseService, type PublicCourseCard } from "@/lib/services/course-service";

interface LearningPanelProps {
  /** Cap on how many courses to fetch. Default 50 matches the legacy
   *  per-profile cap in ProfileCoursesPanel. */
  limit?: number;
  /** When true, hide the section-level intro copy (used by surfaces that
   *  already render their own heading above the grid). */
  hideIntro?: boolean;
}

/**
 * Renders the platform's learning content library — every published course
 * across the platform. Used by the Tools / Learning surface to compete
 * with LinkedIn Learning's separately-licensed content library: ours is
 * bundled into every plan (including Free).
 *
 * The grid is intentionally generic — it reuses CourseMarketplaceCard so
 * cards look identical to the `/search?category=courses` marketplace. The
 * fetch path is `GET /api/courses/public` (already DI-refactored).
 */
export default function LearningPanel({ limit = 50, hideIntro = false }: LearningPanelProps = {}) {
  const [items, setItems] = useState<PublicCourseCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    courseService
      .listPublished(limit)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return (
    <div>
      {!hideIntro && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-brand-purple" />
              Learning Content Library
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Built-in courses on AI, RAG, and must-have skills — SCORM 1.2,
              xAPI tracked, with HMAC-signed verifiable certificates. No
              separate license required.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/services/creator/courses">
              <Button variant="outline" size="sm">
                <Plus className="mr-1 h-4 w-4" /> Author a course
              </Button>
            </Link>
            <Link to="/studio?contentTemplate=course-lesson-explainer">
              <Button variant="outline" size="sm">
                <Video className="mr-1 h-4 w-4" /> Record a video lesson
              </Button>
            </Link>
            <Link to="/search?category=courses">
              <Button variant="outline" size="sm">
                Browse marketplace <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading courses…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground space-y-4">
          <GraduationCap className="h-8 w-8 mx-auto opacity-60" />
          <div>
            <p className="font-medium mb-1">No published courses yet</p>
            <p className="text-sm max-w-xl mx-auto">
              Platform-seeded courses on AI, RAG, and must-have skills will
              appear here once the seed migration runs. Employer-authored
              internal training and creator-published courses surface
              alongside them.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Link to="/services/creator/courses">
              <Button>
                <Plus className="mr-1 h-4 w-4" /> Author the first course
              </Button>
            </Link>
            <Link to="/studio?contentTemplate=course-lesson-explainer">
              <Button variant="outline">
                <Video className="mr-1 h-4 w-4" /> Or record a lesson in Studio
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((c) => (
            <CourseMarketplaceCard key={c.id} item={c as CourseMarketplaceItem} />
          ))}
        </div>
      )}
    </div>
  );
}
