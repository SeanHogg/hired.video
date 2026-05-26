// Reviewer queue page (#1502) — lists every course in `in_review`
// assigned to the calling user. SuperAdmin sees the entire queue.
//
// The threaded review thread for each course reuses studio_review_comments
// (course id passed as the projectId), so the surface here is intentionally
// thin: it's just an inbox + deep-link to the existing course editor.

import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Loader2, GraduationCap, Clock, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { courseService, type Course } from "@/lib/services/course-service";

export default function CourseReviewQueue() {
  const { isAuthenticated } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useSEO("/courses/review-queue");
  useBreadcrumbs([
    { name: "Courses", url: "/learning" },
    { name: "Review queue", url: "/courses/review-queue" },
  ]);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    courseService.listReviewQueue()
      .then((rows) => { if (!cancelled) setCourses(rows); })
      .catch(() => { if (!cancelled) setCourses([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Navigate to="/login?returnTo=/courses/review-queue" replace />;
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-brand-purple" /> Course review queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Courses submitted for your review. Open one to read the modules
            + lessons, leave threaded comments, and approve or send back
            for revision.
          </p>
        </div>

        {loading ? (
          <Card><CardContent className="p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading queue…
          </CardContent></Card>
        ) : courses.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">
            <p className="font-medium mb-1">Inbox zero.</p>
            <p className="text-sm">No courses are currently waiting on your review.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {courses.map((c) => (
              <Card key={c.id} className="hover:border-primary/40 transition-colors">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{c.title}</h3>
                      <Badge variant="secondary" className="text-[10px]">in review</Badge>
                    </div>
                    {c.summary && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{c.summary}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Updated {new Date(c.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/services/creator/courses?courseId=${c.id}`}>
                      Open <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
