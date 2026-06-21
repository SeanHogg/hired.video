/**
 * Tests for FeedPostCard's social actions — the wiring added in the
 * social-feed pass:
 *   • react → reactToFeedPost (professional reactions)
 *   • expand comments → getPostComments (lazy thread load)
 *   • Repost button → reveals the reshare composer
 *   • a repost renders its embedded original + the "reposted" attribution
 *
 * PostStatsSheet (owner analytics drawer) and FeedReviewEmbed are stubbed —
 * they have their own permission/analytics trees that aren't under test here.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders, mockAuthValue } from "../test-render";
import FeedPostCard from "@/components/feed/FeedPostCard";
import { useAuth } from "@/lib/auth";
import * as feedService from "@/lib/services/feed-service";

vi.mock("@/lib/auth");
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/feed/PostStatsSheet", () => ({ default: () => null }));
vi.mock("@/components/feed/FeedReviewEmbed", () => ({ FeedReviewEmbed: () => <div /> }));
vi.mock("@/lib/services/feed-service", () => ({
  reactToFeedPost: vi.fn().mockResolvedValue({}),
  removeFeedPostReaction: vi.fn().mockResolvedValue(undefined),
  reactToComment: vi.fn().mockResolvedValue(undefined),
  removeCommentReaction: vi.fn().mockResolvedValue(undefined),
  applyReactionToComment: vi.fn((c) => c),
  createComment: vi.fn().mockResolvedValue({}),
  getPostComments: vi.fn().mockResolvedValue([]),
  resharePost: vi.fn().mockResolvedValue({}),
  deleteFeedPost: vi.fn().mockResolvedValue(undefined),
  updateFeedPost: vi.fn().mockResolvedValue({}),
  reportFeedPost: vi.fn().mockResolvedValue(undefined),
}));

const basePost = {
  id: "p1",
  userId: "author",
  userName: "Alice",
  content: "Hello world",
  kind: "text",
  privacy: "Public",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  media: [],
  tags: [],
  likes: [],
  comments: [],
  likeCount: 3,
  commentCount: 1,
  repostCount: 0,
  isLikedByCurrentUser: false,
} as any;

const noop = () => undefined;

function renderCard(overrides: Record<string, unknown> = {}) {
  return renderWithProviders(
    <FeedPostCard
      post={{ ...basePost, ...overrides }}
      onReact={noop}
      onComment={noop}
      onDelete={noop}
      onEdit={noop}
      onHide={noop}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (useAuth as Mock).mockReturnValue(
    mockAuthValue(true, { user: { id: "viewer", name: "Viewer" } }),
  );
});

describe("FeedPostCard", () => {
  it("renders the author and content", () => {
    renderCard();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Hello world")).toBeTruthy();
  });

  it("reacts via the service when the reaction button is clicked", async () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /React/i }));
    await waitFor(() => expect(feedService.reactToFeedPost).toHaveBeenCalledWith("p1", "like"));
  });

  it("lazy-loads the comment thread when comments are expanded", async () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    await waitFor(() => expect(feedService.getPostComments).toHaveBeenCalledWith("p1"));
  });

  it("opens the reshare composer from the Repost button", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Repost" }));
    expect(screen.getByPlaceholderText(/Add a comment to your repost/i)).toBeTruthy();
  });

  it("renders the embedded original + attribution for a repost", () => {
    renderCard({
      repostOfId: "orig",
      repostOf: { ...basePost, id: "orig", userName: "Bob", content: "Original post" },
    });
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("Original post")).toBeTruthy();
    expect(screen.getByText(/reposted/i)).toBeTruthy();
  });
});
