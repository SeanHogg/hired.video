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
};
