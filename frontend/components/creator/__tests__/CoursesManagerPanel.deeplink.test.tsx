import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CoursesManagerPanel from "@/components/creator/CoursesManagerPanel";

// #1521 — deep-link from the /learn "Edit" button. The panel reads
// ?courseId=, loads the course, and drops into edit mode.
//
// We mock the *apiClient* (not courseService) so the real CourseService
// unwrapping logic runs against the real wire shape. The single-course
// endpoint GET /api/courses/:id ONLY ever returns the detail envelope
// ({course, modules, lessons}) — there is no bare-course variant. An
// earlier getMine returned that envelope as-is, so every `course.title`/
// `course.id` came back undefined and the editor crashed on a render-time
// `title.trim()`. Mocking the service with a fake bare `{ id, title }`
// masked that (per feedback_tests_with_real_fixtures) — this uses the
// real shape instead.

const getMock = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: (path: string) => getMock(path),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/services/creator-service", () => ({
  creatorService: {
    getMine: () => Promise.resolve({ coursesActive: true, endedAt: null }),
  },
}));

vi.mock("@/lib/services/studio-templates-service", () => ({
  studioTemplatesService: { listMine: () => Promise.resolve([]) },
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

// Minimal-but-faithful course row — mirrors the columns the panel reads
// in beginEdit() so a missing field would surface as a real crash.
const COURSE = {
  id: "c1",
  userId: "u1",
  slug: "deep-linked-course",
  title: "Deep Linked Course",
  summary: "A summary",
  description: "A description",
  coverImageUrl: null,
  category: "career",
  tags: ["interviewing"],
  difficulty: null,
  estimatedMinutes: null,
  status: "draft",
  publishedAt: null,
  priceCents: 0,
  priceVisible: true,
  platformFeeBps: 500,
  issuesCertificate: false,
  passingScorePct: null,
  isEmployerAuthored: false,
  enrollmentCount: 0,
  completionCount: 0,
  averageRating: null,
  ratingCount: 0,
  themeId: null,
  themeTokens: null,
  assignedReviewerId: null,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

beforeEach(() => {
  getMock.mockReset();
  // apiClient.get resolves to an ApiResponse-shaped wrapper; the services
  // read `.data`. /api/courses/me → the (empty) own-course list.
  // /api/courses/:id → the detail ENVELOPE (the only real shape).
  getMock.mockImplementation((path: string) => {
    if (path === "/api/courses/me") return Promise.resolve({ data: [] });
    if (path.startsWith("/api/courses/")) {
      return Promise.resolve({ data: { course: COURSE, modules: [], lessons: [] } });
    }
    return Promise.resolve({ data: null });
  });
});

it("auto-opens the deep-linked course in edit mode with its title populated", async () => {
  render(
    <MemoryRouter initialEntries={["/services/creator/courses?courseId=c1&lessonId=l1"]}>
      <CoursesManagerPanel />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(getMock).toHaveBeenCalledWith("/api/courses/c1");
  });

  // Step 1 edit form is showing…
  expect(await screen.findByText(/Course details/i)).toBeInTheDocument();
  // …and the title input is actually populated from the unwrapped course.
  // (Regression guard: a wrong-shape response made this undefined and the
  // render-time `title.trim()` threw "Cannot read properties of undefined".)
  expect(await screen.findByDisplayValue("Deep Linked Course")).toBeInTheDocument();
});
