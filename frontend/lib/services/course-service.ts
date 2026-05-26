import { apiClient } from "@/lib/api-client";

export type CourseStatus = "draft" | "published" | "unlisted" | "flagged";
export type CourseDifficulty = "beginner" | "intermediate" | "advanced";

export interface Course {
  id: string;
  userId: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  coverImageUrl: string | null;
  category: string | null;
  tags: string[];
  difficulty: CourseDifficulty | null;
  estimatedMinutes: number | null;
  status: CourseStatus;
  publishedAt: string | null;
  priceCents: number;
  priceVisible: boolean;
  platformFeeBps: number;
  issuesCertificate: boolean;
  passingScorePct: number | null;
  enrollmentCount: number;
  completionCount: number;
  averageRating: number | null;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCourseInput {
  title: string;
  summary?: string;
  description?: string;
  coverImageUrl?: string;
  category?: string;
  tags?: string[];
  difficulty?: CourseDifficulty;
  estimatedMinutes?: number;
  priceCents?: number;
  priceVisible?: boolean;
  issuesCertificate?: boolean;
  passingScorePct?: number;
}

export interface UpdateCourseInput extends Partial<CreateCourseInput> {
  slug?: string;
}

export type CourseLessonSourceType =
  | "studio_video"
  | "scorm_package"
  | "external_url"
  | "text_md";

export type ScormVersion = "1.2" | "2004_1" | "2004_2" | "2004_3" | "2004_4";

export interface CourseModule {
  id: string;
  courseId: string;
  title: string;
  summary: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CourseLesson {
  id: string;
  courseId: string;
  moduleId: string | null;
  title: string;
  summary: string | null;
  sourceType: CourseLessonSourceType;
  studioProjectId: string | null;
  scormManifestUrl: string | null;
  scormEntryUrl: string | null;
  scormVersion: ScormVersion | null;
  // #1440 — uuid of the R2 prefix under uploads/<userId>/scorm/<pkgId>/
  // that wraps every file in the SCORM package. Drives prefix cleanup
  // when the lesson is deleted. Only set for `scorm_package` lessons.
  scormPkgId: string | null;
  externalUrl: string | null;
  bodyMd: string | null;
  // Tiptap JSON kept in lockstep with bodyMd for text_md lessons authored
  // through the WYSIWYG editor (#1569). Null on legacy rows + non-text_md
  // sources.
  bodyJson: unknown | null;
  estimatedMinutes: number | null;
  isRequired: boolean;
  knowledgeCheckFormId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateModuleInput {
  title: string;
  summary?: string;
  sortOrder?: number;
}

export interface UpdateModuleInput {
  title?: string;
  summary?: string | null;
  sortOrder?: number;
}

export interface CreateLessonInput {
  title: string;
  summary?: string;
  moduleId?: string | null;
  sourceType: CourseLessonSourceType;
  studioProjectId?: string | null;
  scormManifestUrl?: string | null;
  scormEntryUrl?: string | null;
  scormVersion?: ScormVersion | null;
  scormPkgId?: string | null;
  externalUrl?: string | null;
  bodyMd?: string | null;
  bodyJson?: unknown;
  estimatedMinutes?: number;
  isRequired?: boolean;
  sortOrder?: number;
}

export type UpdateLessonInput = Partial<CreateLessonInput>;

export interface CourseDetailsResponse {
  course: Course;
  modules: CourseModule[];
  lessons: CourseLesson[];
}

export type LessonProgressStatus = "not_started" | "in_progress" | "passed" | "failed";

export interface LessonProgress {
  status: LessonProgressStatus;
  scoreRaw?: number;
  scoreMax?: number;
  timeSpentSec?: number;
  lastSeenAt?: string;
}

export interface CourseEnrollment {
  id: string;
  courseId: string;
  userId: string;
  enrolledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  progress: Record<string, LessonProgress>;
  finalScorePct: number | null;
  passed: boolean;
}

export interface CourseCertificateSummary {
  certNumber: string;
  issuedAt: string;
  expiresAt: string | null;
}

export interface CourseLearnerContent {
  enrollment: CourseEnrollment;
  course: Course;
  modules: CourseModule[];
  lessons: CourseLesson[];
  /** Public-safe certificate summary when one has been issued for this
   *  enrollment. Drives the "View certificate" CTA — the cert number is
   *  the only thing the verify URL needs. */
  certificate: CourseCertificateSummary | null;
}

export interface EnrollmentRow {
  enrollment: CourseEnrollment;
  course: Course;
  /** Annotated by the listMyEnrollments handler (#1462). Lets cards
   *  render an accurate "N of M lessons" progress bar without a
   *  per-row round-trip. */
  totalLessons: number;
  passedLessons: number;
}

export interface PublicCourseCard {
  id: string;
  type: "course";
  title: string;
  slug: string;
  summary: string | null;
  coverImageUrl: string | null;
  category: string | null;
  tags: string[];
  difficulty: CourseDifficulty | null;
  estimatedMinutes: number | null;
  priceCents: number | null;
  issuesCertificate: boolean;
  enrollmentCount: number;
  averageRating: number | null;
  ratingCount: number;
  publishedAt: string | null;
  author: { id: string; name: string; avatarUrl: string | null; slug: string };
}

export const courseService = {
  async listMine(): Promise<Course[]> {
    const res = await apiClient.get<Course[]>("/api/courses/me");
    return res.data ?? [];
  },

  async listPublishedByUser(userId: string, limit = 50): Promise<PublicCourseCard[]> {
    const res = await apiClient.get<PublicCourseCard[]>(
      `/api/courses/public/by-user/${userId}?limit=${limit}`,
      undefined,
      { suppressErrorEvent: true },
    );
    return res.data ?? [];
  },

  async listPublished(limit = 50): Promise<PublicCourseCard[]> {
    const res = await apiClient.get<PublicCourseCard[]>(
      `/api/courses/public?limit=${limit}`,
      undefined,
      { suppressErrorEvent: true },
    );
    return res.data ?? [];
  },

  async getMine(id: string): Promise<Course> {
    const res = await apiClient.get<Course>(`/api/courses/${id}`);
    return res.data;
  },

  async create(input: CreateCourseInput): Promise<Course> {
    const res = await apiClient.post<Course>("/api/courses", input);
    return res.data;
  },

  async update(id: string, input: UpdateCourseInput): Promise<Course> {
    const res = await apiClient.patch<Course>(`/api/courses/${id}`, input);
    return res.data;
  },

  async publish(id: string): Promise<Course> {
    const res = await apiClient.post<Course>(`/api/courses/${id}/publish`, {});
    return res.data;
  },

  async unpublish(id: string): Promise<Course> {
    const res = await apiClient.post<Course>(`/api/courses/${id}/unpublish`, {});
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/api/courses/${id}`);
  },

  // ── Course content (modules + lessons) ──────────────────────────────
  // GET /:id returns { course, modules, lessons } — same response shape
  // the API has shipped since migration 0041 (#160). The authoring UI
  // ([CoursesManagerPanel](../../components/creator/CoursesManagerPanel.tsx))
  // consumes this to render the module → lesson tree.

  async getDetails(id: string): Promise<CourseDetailsResponse> {
    const res = await apiClient.get<CourseDetailsResponse>(`/api/courses/${id}`);
    return res.data;
  },

  async addModule(courseId: string, input: CreateModuleInput): Promise<CourseModule> {
    const res = await apiClient.post<CourseModule>(`/api/courses/${courseId}/modules`, input);
    return res.data;
  },

  async updateModule(moduleId: string, input: UpdateModuleInput): Promise<CourseModule> {
    const res = await apiClient.patch<CourseModule>(`/api/courses/modules/${moduleId}`, input);
    return res.data;
  },

  async removeModule(moduleId: string): Promise<void> {
    await apiClient.delete(`/api/courses/modules/${moduleId}`);
  },

  async addLesson(courseId: string, input: CreateLessonInput): Promise<CourseLesson> {
    const res = await apiClient.post<CourseLesson>(`/api/courses/${courseId}/lessons`, input);
    return res.data;
  },

  async updateLesson(lessonId: string, input: UpdateLessonInput): Promise<CourseLesson> {
    const res = await apiClient.patch<CourseLesson>(`/api/courses/lessons/${lessonId}`, input);
    return res.data;
  },

  async removeLesson(lessonId: string): Promise<void> {
    await apiClient.delete(`/api/courses/lessons/${lessonId}`);
  },

  // ── Learner-side ────────────────────────────────────────────────────

  async enroll(courseId: string): Promise<CourseEnrollment> {
    const res = await apiClient.post<CourseEnrollment>(`/api/courses/${courseId}/enroll`, {});
    return res.data;
  },

  // 409 CERTIFICATE_ISSUED if a cert exists — backend refuses, since the cert
  // FK cascades on enrollment delete.
  async unenroll(courseId: string): Promise<void> {
    await apiClient.delete(`/api/courses/${courseId}/enroll`);
  },

  async listMyEnrollments(): Promise<EnrollmentRow[]> {
    const res = await apiClient.get<EnrollmentRow[]>(`/api/courses/me/enrollments`);
    return res.data ?? [];
  },

  async getLearnerContent(enrollmentId: string): Promise<CourseLearnerContent> {
    const res = await apiClient.get<CourseLearnerContent>(
      `/api/courses/enrollments/${enrollmentId}/content`,
    );
    return res.data;
  },

  async patchLessonProgress(
    enrollmentId: string,
    body: {
      lessonId: string;
      status: LessonProgressStatus;
      scoreRaw?: number;
      scoreMax?: number;
      timeSpentSec?: number;
    },
  ): Promise<CourseEnrollment> {
    const res = await apiClient.patch<CourseEnrollment>(
      `/api/courses/enrollments/${enrollmentId}/progress`,
      body,
    );
    return res.data;
  },
};
