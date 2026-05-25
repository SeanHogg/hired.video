// Public detail page for a single course. Renders the marketplace landing
// surface for a shared `/courses/<authorSlug>/<courseSlug>` link — works
// for unauthenticated viewers (consumes the public `/api/courses/public/...`
// endpoint, server-side paywall-gated for free creators per #314). Auth'd
// viewers get an Enroll CTA wired to `POST /api/courses/:id/enroll`.
//
// Page chrome composed from `<MarketplaceItemShell/>` so it matches the
// resume-template marketplace (#700/#761). All share affordances route
// through the platform-wide `buildShareAction` helper.

import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Award,
  BookOpen,
  Clock,
  GraduationCap,
  Loader2,
  Share2,
  Star,
  Users,
} from "lucide-react";

import MarketplaceItemShell from "@/components/marketplace/MarketplaceItemShell";
import BaseCard from "@/components/ui/BaseCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { buildShareAction } from "@/lib/card-share-action";
import { useUgcSeo } from "@/lib/seo-ugc";
import { toast } from "@/components/ui/use-toast";

interface CourseAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
  slug: string;
}

interface CourseDetail {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  coverImageUrl: string | null;
  category: string | null;
  tags?: string[];
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  estimatedMinutes: number | null;
  priceCents: number | null;
  issuesCertificate: boolean;
  passingScorePct: number | null;
  enrollmentCount: number;
  completionCount: number;
  averageRating: number | null;
  ratingCount: number;
  publishedAt: string | null;
  author: CourseAuthor;
}

interface CourseModule {
  id: string;
  title: string;
  summary: string | null;
  sortOrder: number;
}

interface CourseLesson {
  id: string;
  moduleId: string;
  title: string;
  summary: string | null;
  sourceType: string;
  estimatedMinutes: number | null;
  isRequired: boolean;
  sortOrder: number;
}

interface CoursePublicResponse {
  course: CourseDetail;
  modules: CourseModule[];
  lessons: CourseLesson[];
}

function formatPrice(cents: number | null): string {
  if (cents == null) return "Contact for pricing";
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDuration(minutes: number | null): string | null {
  if (minutes == null) return null;
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function CourseSEO({ course }: { course: CourseDetail }) {
  useUgcSeo("course", {
    slug: course.slug,
    title: course.title,
    summary: course.summary,
    description: course.description,
    coverImageUrl: course.coverImageUrl,
    category: course.category,
    tags: course.tags,
    author: { name: course.author.name, slug: course.author.slug },
  });
  return null;
}

export default function CoursePublicDetail() {
  const { authorSlug, courseSlug } = useParams<{
    authorSlug: string;
    courseSlug: string;
  }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<CoursePublicResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    if (!authorSlug || !courseSlug) return;
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<CoursePublicResponse>(
        `/api/courses/public/${encodeURIComponent(authorSlug)}/${encodeURIComponent(courseSlug)}`,
        undefined,
        { suppressErrorEvent: true },
      )
      .then((res) => {
        if (cancelled) return;
        if (!res.data) {
          setNotFound(true);
        } else {
          setData(res.data);
        }
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authorSlug, courseSlug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !data) {
    return <Navigate to="/search?category=courses" replace />;
  }

  const { course, modules, lessons } = data;
  const shareAction = buildShareAction({
    entityUrl: `/courses/${course.author.slug}/${course.slug}`,
    copySuccessDescription: "Course link has been copied to your clipboard.",
  });
  const duration = formatDuration(course.estimatedMinutes);
  const lessonsByModule = (moduleId: string) =>
    lessons
      .filter((l) => l.moduleId === moduleId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  const handleEnroll = async () => {
    if (!isAuthenticated) {
      navigate(`/login?returnTo=/courses/${course.author.slug}/${course.slug}`);
      return;
    }
    setEnrolling(true);
    try {
      await apiClient.post(`/api/courses/${course.id}/enroll`);
      toast({
        title: "Enrolled!",
        description: `You're enrolled in ${course.title}.`,
      });
    } catch (err) {
      toast({
        title: "Couldn't enroll",
        description: (err as Error).message || "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setEnrolling(false);
    }
  };

  const badges = (
    <>
      <Badge variant="outline" className="text-xs">
        <GraduationCap className="h-3 w-3 mr-1" /> Course
      </Badge>
      {course.category && <Badge variant="secondary">{course.category}</Badge>}
      {course.difficulty && (
        <Badge variant="outline" className="capitalize">
          {course.difficulty}
        </Badge>
      )}
      {course.issuesCertificate && (
        <Badge className="bg-amber-500 text-white border-0">
          <Award className="h-3 w-3 mr-1" /> Cert
        </Badge>
      )}
    </>
  );

  const actions = (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Share course"
        onClick={(e) => shareAction.onClick(e)}
        className="gap-2"
      >
        <Share2 className="h-4 w-4" />
        Share
      </Button>
      <span className="font-semibold tabular-nums">
        {formatPrice(course.priceCents)}
      </span>
      <Button
        size="sm"
        onClick={handleEnroll}
        disabled={enrolling}
        className="gap-2"
      >
        {enrolling ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Enrolling…
          </>
        ) : (
          <>Enroll</>
        )}
      </Button>
    </>
  );

  return (
    <MarketplaceItemShell
      seo={<CourseSEO course={course} />}
      badges={badges}
      actions={actions}
      preview={
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          {course.coverImageUrl && (
            <div className="aspect-video overflow-hidden rounded-xl border bg-muted">
              <img
                src={course.coverImageUrl}
                alt={course.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {course.title}
            </h1>
            {course.summary && (
              <p className="text-base text-muted-foreground">{course.summary}</p>
            )}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground pt-2">
              <Link
                to={`/people/${course.author.slug}`}
                className="flex items-center gap-2 hover:text-foreground transition-colors"
              >
                {course.author.avatarUrl ? (
                  <img
                    src={course.author.avatarUrl}
                    alt=""
                    className="h-6 w-6 rounded-full"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">
                    {(course.author.name ?? "?")[0]}
                  </div>
                )}
                <span>{course.author.name}</span>
              </Link>
              {duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {duration}
                </span>
              )}
              {course.enrollmentCount > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> {course.enrollmentCount}{" "}
                  enrolled
                </span>
              )}
              {course.averageRating != null && course.averageRating > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {Number(course.averageRating).toFixed(1)}
                  {course.ratingCount > 0 && (
                    <span className="text-xs">
                      ({course.ratingCount})
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          {course.description && (
            <BaseCard hover={false}>
              <CardContent className="pt-6 space-y-3">
                <h2 className="font-semibold">About this course</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {course.description}
                </p>
              </CardContent>
            </BaseCard>
          )}

          {modules.length > 0 && (
            <BaseCard hover={false}>
              <CardContent className="pt-6 space-y-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Curriculum
                </h2>
                <div className="space-y-4">
                  {modules
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((m, idx) => {
                      const moduleLessons = lessonsByModule(m.id);
                      return (
                        <div key={m.id} className="space-y-2">
                          <div>
                            <h3 className="text-sm font-medium">
                              {idx + 1}. {m.title}
                            </h3>
                            {m.summary && (
                              <p className="text-xs text-muted-foreground">
                                {m.summary}
                              </p>
                            )}
                          </div>
                          {moduleLessons.length > 0 && (
                            <ul className="ml-4 space-y-1 text-xs text-muted-foreground">
                              {moduleLessons.map((l) => (
                                <li key={l.id} className="flex items-center gap-2">
                                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                                  <span className="flex-1">{l.title}</span>
                                  {l.estimatedMinutes != null && (
                                    <span className="tabular-nums">
                                      {l.estimatedMinutes}m
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </BaseCard>
          )}
        </div>
      }
    />
  );
}
