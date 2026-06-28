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
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Award,
  BookOpen,
  Check,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UnenrollButton } from "@/components/courses/UnenrollButton";
import WishlistButton from "@/components/wishlist/WishlistButton";
import { ReviewsSection } from "@/components/reviews/ReviewsSection";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { buildShareAction } from "@/lib/card-share-action";
import { buildImageUrl } from "@/lib/utils";
import { useUgcSeo } from "@/lib/seo-ugc";
import { toast } from "@/components/ui/use-toast";
import { courseService, type CourseEnrollment } from "@/lib/services/course-service";
import { courseCategoryLabel } from "@/lib/course-category";

interface CourseAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
  slug: string;
  headline?: string | null;
  bio?: string | null;
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
  learningOutcomes?: string[];
  requirements?: string[];
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

function FactCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium capitalize truncate">{value}</div>
    </div>
  );
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
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const [data, setData] = useState<CoursePublicResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  // Existing enrollment for this user (if any) — drives the
  // Enroll vs. Continue-learning CTA + the post-enroll redirect target.
  const [enrollment, setEnrollment] = useState<CourseEnrollment | null>(null);

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

  // Check if the viewer is already enrolled, so the CTA can switch to
  // "Continue learning" + deep-link to /learn/:enrollmentId. The
  // me/enrollments endpoint is small and authed; failures degrade
  // silently to the unenrolled CTA.
  useEffect(() => {
    if (!isAuthenticated || !data) return;
    let cancelled = false;
    courseService
      .listMyEnrollments()
      .then((rows) => {
        if (cancelled) return;
        const found = rows.find((r) => r.course.id === data.course.id);
        if (found) setEnrollment(found.enrollment);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, data]);

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
    // Already enrolled — jump straight into the learner surface instead
    // of re-POSTing the (idempotent) enroll call.
    if (enrollment) {
      navigate(`/learn/${enrollment.id}`);
      return;
    }
    setEnrolling(true);
    try {
      const created = await courseService.enroll(course.id);
      setEnrollment(created);
      toast({
        title: "Enrolled!",
        description: `You're enrolled in ${course.title}.`,
      });
      navigate(`/learn/${created.id}`);
    } catch (err) {
      // Paid course → backend signals 402 PAYMENT_REQUIRED; route to the
      // course-checkout page which mints the course_checkouts row + hands
      // off to the existing payment provider.
      const code = (err as { code?: string } | null)?.code;
      if (code === "PAYMENT_REQUIRED") {
        navigate(`/checkout/course/${course.id}`);
        return;
      }
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
      {course.category && (
        <Badge variant="secondary">{courseCategoryLabel(course.category, t)}</Badge>
      )}
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
      <WishlistButton entityType="course" entityId={course.id} showLabel />
      <span className="font-semibold tabular-nums">
        {formatPrice(course.priceCents)}
      </span>
      {enrollment && (
        <UnenrollButton
          courseId={course.id}
          courseTitle={course.title}
          isPassed={enrollment.passed}
          onUnenrolled={() => setEnrollment(null)}
        />
      )}
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
        ) : enrollment ? (
          <>Continue learning</>
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
        <div className="px-4 sm:px-6 py-8 space-y-6">
          {course.coverImageUrl && (
            <div className="aspect-video overflow-hidden rounded-xl border bg-muted">
              <img
                src={buildImageUrl(course.coverImageUrl)}
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

          <Tabs defaultValue="overview" className="w-full">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              {modules.length > 0 && (
                <TabsTrigger value="curriculum">
                  Curriculum
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {lessons.length}
                  </span>
                </TabsTrigger>
              )}
              <TabsTrigger value="instructor">Instructor</TabsTrigger>
              <TabsTrigger value="reviews">
                Reviews
                {course.ratingCount > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {course.ratingCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Overview ──────────────────────────────────────────── */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              <BaseCard hover={false}>
                <CardContent className="pt-6 space-y-3">
                  <h2 className="font-semibold">About this course</h2>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {course.description ||
                      course.summary ||
                      "The instructor hasn't added a description yet."}
                  </p>
                </CardContent>
              </BaseCard>
              {course.learningOutcomes && course.learningOutcomes.length > 0 && (
                <BaseCard hover={false}>
                  <CardContent className="pt-6 space-y-3">
                    <h2 className="font-semibold">{t("course.detail.whatYouWillLearn")}</h2>
                    <ul className="grid sm:grid-cols-2 gap-2">
                      {course.learningOutcomes.map((o, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <Check className="w-4 h-4 mt-0.5 text-emerald-600 flex-shrink-0" />
                          <span>{o}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </BaseCard>
              )}
              {course.requirements && course.requirements.length > 0 && (
                <BaseCard hover={false}>
                  <CardContent className="pt-6 space-y-3">
                    <h2 className="font-semibold">{t("course.detail.requirements")}</h2>
                    <ul className="space-y-1.5">
                      {course.requirements.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </BaseCard>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <FactCard label="Level" value={course.difficulty ?? "All levels"} />
                <FactCard label="Duration" value={duration ?? "Self-paced"} />
                <FactCard label="Lessons" value={String(lessons.length)} />
                <FactCard
                  label="Certificate"
                  value={course.issuesCertificate ? "Yes" : "No"}
                />
              </div>
            </TabsContent>

            {/* ── Curriculum ────────────────────────────────────────── */}
            {modules.length > 0 && (
              <TabsContent value="curriculum" className="mt-4">
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
                                    <li
                                      key={l.id}
                                      className="flex items-center gap-2"
                                    >
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
              </TabsContent>
            )}

            {/* ── Instructor ────────────────────────────────────────── */}
            <TabsContent value="instructor" className="mt-4">
              <BaseCard hover={false}>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-3">
                    {course.author.avatarUrl ? (
                      <img
                        src={course.author.avatarUrl}
                        alt=""
                        className="h-14 w-14 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-lg font-semibold">
                        {(course.author.name ?? "?")[0]}
                      </div>
                    )}
                    <div>
                      <h2 className="font-semibold">{course.author.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {course.author.headline || "Instructor"}
                      </p>
                    </div>
                  </div>
                  {course.author.bio && (
                    <p className="text-sm text-muted-foreground whitespace-pre-line">
                      {course.author.bio}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-6 text-sm">
                    <div>
                      <div className="font-semibold tabular-nums">
                        {course.enrollmentCount}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Learners enrolled
                      </div>
                    </div>
                    {course.averageRating != null && course.averageRating > 0 && (
                      <div>
                        <div className="font-semibold tabular-nums flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          {Number(course.averageRating).toFixed(1)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Course rating
                        </div>
                      </div>
                    )}
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/people/${course.author.slug}`}>
                      View full profile
                    </Link>
                  </Button>
                </CardContent>
              </BaseCard>
            </TabsContent>

            {/* ── Reviews ───────────────────────────────────────────── */}
            <TabsContent value="reviews" className="mt-4">
              <ReviewsSection
                subjectType="course"
                subjectId={course.id}
                subjectName={course.title}
                isOwner={isAuthenticated && user?.id === course.author.id}
              />
            </TabsContent>
          </Tabs>
        </div>
      }
    />
  );
}
