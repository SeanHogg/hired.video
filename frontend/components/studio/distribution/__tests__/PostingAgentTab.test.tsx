/**
 * Agent tab: Pro gate, draft cards, 10-minute undo, and service wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PostingAgentTab } from "../PostingAgentTab";
import type { PostingAgentDraftDto, PostingAgentSettingsDto } from "@/lib/services/distribution-service";

const settings: PostingAgentSettingsDto = {
  enabled: true,
  mode: "approve",
  cadence: "steady",
  postMinute: 720,
  destinations: ["feed"],
  quietStartMinute: 21 * 60,
  quietEndMinute: 8 * 60,
  emailDigest: true,
  pausedReason: null,
  globallyEnabled: true,
};

const pendingDraft: PostingAgentDraftDto = {
  id: "draft-1",
  projectId: "proj-1",
  projectTitle: "My clip",
  destination: "feed",
  lane: "self",
  caption: "Hello recruiters",
  captionSource: "ai",
  status: "draft",
  scheduledAt: "2026-10-11T12:00:00.000Z",
  runAt: "2026-10-11T12:00:00.000Z",
  expiresAt: "2026-10-12T12:00:00.000Z",
  createdAt: "2026-10-11T11:00:00.000Z",
  canUndo: false,
};

const undoDraft: PostingAgentDraftDto = {
  ...pendingDraft,
  id: "draft-2",
  status: "scheduled",
  canUndo: true,
};

const sub = vi.hoisted(() => ({ isPro: true, loading: false }));

const svc = vi.hoisted(() => ({
  getPostingAgentSettings: vi.fn(),
  listPostingAgentDrafts: vi.fn(),
  savePostingAgentSettings: vi.fn(),
  startPostingAgent: vi.fn(),
  pausePostingAgent: vi.fn(),
  approvePostingAgentDraft: vi.fn(),
  skipPostingAgentDraft: vi.fn(),
  rewritePostingAgentDraft: vi.fn(),
  undoPostingAgentDraft: vi.fn(),
  approveAllPostingAgentDrafts: vi.fn(),
  preparePostingAgentDraft: vi.fn(),
}));

const prepareClip = vi.hoisted(() => vi.fn());

vi.mock("@/lib/hooks/useSubscription", () => ({
  useSubscription: () => sub,
}));

vi.mock("@/lib/services/distribution-service", () => ({
  distributionService: svc,
}));

vi.mock("@/components/studio/v2/focus/ProUpsellCard", () => ({
  default: () => <div>Pro upsell</div>,
}));

vi.mock("@/lib/studio/prepare-agent-clip", () => ({
  prepareAgentClip: prepareClip,
}));

vi.mock("@/lib/studio/use-remove-branding-flag", () => ({
  useRemoveBrandingFlag: () => ({ removeBranding: false, rawRemoveBranding: false, setRemoveBranding: vi.fn() }),
}));

function renderTab() {
  return render(
    <MemoryRouter>
      <PostingAgentTab />
    </MemoryRouter>,
  );
}

describe("<PostingAgentTab />", () => {
  beforeEach(() => {
    sub.isPro = true;
    sub.loading = false;
    Object.values(svc).forEach((fn) => fn.mockReset());
    svc.getPostingAgentSettings.mockResolvedValue(settings);
    svc.listPostingAgentDrafts.mockResolvedValue([]);
    svc.savePostingAgentSettings.mockResolvedValue(settings);
    svc.startPostingAgent.mockResolvedValue(settings);
    svc.pausePostingAgent.mockResolvedValue({ ...settings, enabled: false });
    svc.approvePostingAgentDraft.mockResolvedValue(undefined);
    svc.skipPostingAgentDraft.mockResolvedValue(undefined);
    svc.rewritePostingAgentDraft.mockResolvedValue({ rewritten: true });
    svc.undoPostingAgentDraft.mockResolvedValue(undefined);
    svc.approveAllPostingAgentDrafts.mockResolvedValue(undefined);
    svc.preparePostingAgentDraft.mockResolvedValue(undefined);
    prepareClip.mockReset();
    prepareClip.mockResolvedValue("variant-1");
  });

  it("shows the Pro upsell when the user is not Pro", async () => {
    sub.isPro = false;
    renderTab();
    expect(await screen.findByText("Pro upsell")).toBeInTheDocument();
    expect(screen.getByText("The posting agent is a Pro feature.")).toBeInTheDocument();
    expect(svc.getPostingAgentSettings).toHaveBeenCalled();
  });

  it("renders settings and an empty drafts state", async () => {
    renderTab();
    expect(await screen.findByRole("heading", { name: "Posting agent" })).toBeInTheDocument();
    expect(screen.getByText("No drafts waiting. When the agent has a clip, it will show up here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save settings" })).toBeInTheDocument();
    expect(screen.getByText("Email me a digest of drafts")).toBeInTheDocument();
  });

  it("shows Approve / Skip / Rewrite on a pending draft, not Undo", async () => {
    svc.listPostingAgentDrafts.mockResolvedValue([pendingDraft]);
    renderTab();
    expect(await screen.findByText("My clip")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rewrite caption" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("approves a draft through the distribution service", async () => {
    svc.listPostingAgentDrafts.mockResolvedValue([pendingDraft]);
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(svc.approvePostingAgentDraft).toHaveBeenCalledWith("draft-1"));
    expect(svc.rewritePostingAgentDraft).not.toHaveBeenCalled();
  });

  it("saves an edited caption before approving", async () => {
    svc.listPostingAgentDrafts.mockResolvedValue([pendingDraft]);
    renderTab();
    const box = await screen.findByDisplayValue("Hello recruiters");
    fireEvent.change(box, { target: { value: "Edited caption" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(svc.rewritePostingAgentDraft).toHaveBeenCalledWith("draft-1", "Edited caption"));
    expect(svc.approvePostingAgentDraft).toHaveBeenCalledWith("draft-1");
  });

  it("shows Undo (not Approve) while canUndo is true", async () => {
    svc.listPostingAgentDrafts.mockResolvedValue([undoDraft]);
    renderTab();
    expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(svc.undoPostingAgentDraft).toHaveBeenCalledWith("draft-2"));
  });

  it("approves every pending draft, skipping undo-window rows", async () => {
    svc.listPostingAgentDrafts.mockResolvedValue([pendingDraft, undoDraft]);
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Approve all" }));
    await waitFor(() => expect(svc.approveAllPostingAgentDrafts).toHaveBeenCalled());
  });

  it("explains a global kill-switch instead of showing settings", async () => {
    svc.getPostingAgentSettings.mockResolvedValue({ ...settings, globallyEnabled: false });
    renderTab();
    expect(await screen.findByText("The posting agent is turned off for everyone right now.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save settings" })).not.toBeInTheDocument();
  });

  it("links to billing when the agent paused for tokens", async () => {
    svc.getPostingAgentSettings.mockResolvedValue({ ...settings, pausedReason: "plan" });
    renderTab();
    const link = await screen.findByRole("link", { name: "Buy tokens" });
    expect(link).toHaveAttribute("href", "/billing");
  });

  it("blocks Save when the post time falls inside quiet hours", async () => {
    svc.getPostingAgentSettings.mockResolvedValue({ ...settings, postMinute: 22 * 60 });
    renderTab();
    expect(await screen.findByText("Pick a post time outside quiet hours.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
  });

  it("blocks Save when no channel is selected", async () => {
    svc.getPostingAgentSettings.mockResolvedValue({ ...settings, destinations: [] });
    renderTab();
    expect(await screen.findByText("Choose at least one channel.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
  });

  it("pauses through the distribution service", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Pause" }));
    await waitFor(() => expect(svc.pausePostingAgent).toHaveBeenCalled());
  });

  it("keeps Start agent disabled when an admin paused the agent", async () => {
    svc.getPostingAgentSettings.mockResolvedValue({ ...settings, enabled: false, pausedReason: "admin" });
    renderTab();
    expect(await screen.findByText("An admin paused your posting agent.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start agent" })).toBeDisabled();
  });

  it("skips a draft through the distribution service", async () => {
    svc.listPostingAgentDrafts.mockResolvedValue([pendingDraft]);
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    await waitFor(() => expect(svc.skipPostingAgentDraft).toHaveBeenCalledWith("draft-1"));
  });

  it("rewrites a caption through the distribution service", async () => {
    svc.listPostingAgentDrafts.mockResolvedValue([pendingDraft]);
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Rewrite caption" }));
    await waitFor(() => expect(svc.rewritePostingAgentDraft).toHaveBeenCalledWith("draft-1"));
    expect(svc.approvePostingAgentDraft).not.toHaveBeenCalled();
  });

  it("starts the agent through the distribution service", async () => {
    svc.getPostingAgentSettings.mockResolvedValue({ ...settings, enabled: false, pausedReason: null });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Start agent" }));
    await waitFor(() =>
      expect(svc.startPostingAgent).toHaveBeenCalledWith({
        mode: "approve",
        cadence: "steady",
        postMinute: 720,
        destinations: ["feed"],
        quietStartMinute: 21 * 60,
        quietEndMinute: 8 * 60,
        emailDigest: true,
      }),
    );
  });

  it("saves settings through the distribution service", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Save settings" }));
    await waitFor(() =>
      expect(svc.savePostingAgentSettings).toHaveBeenCalledWith({
        mode: "approve",
        cadence: "steady",
        postMinute: 720,
        destinations: ["feed"],
        quietStartMinute: 21 * 60,
        quietEndMinute: 8 * 60,
        emailDigest: true,
      }),
    );
  });

  it("keeps the draft visible when rewrite fails", async () => {
    svc.listPostingAgentDrafts.mockResolvedValue([pendingDraft]);
    svc.rewritePostingAgentDraft.mockRejectedValue(new Error("rewrite failed"));
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Rewrite caption" }));
    await waitFor(() => expect(svc.rewritePostingAgentDraft).toHaveBeenCalledWith("draft-1"));
    expect(await screen.findByText("Could not save.")).toBeInTheDocument();
    expect(screen.getByText("My clip")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Hello recruiters")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rewrite caption" })).toBeInTheDocument();
  });

  it("shows when the draft expires", async () => {
    svc.listPostingAgentDrafts.mockResolvedValue([pendingDraft]);
    renderTab();
    const expiry = await screen.findByText(/expires/i);
    expect(expiry.tagName).toBe("TIME");
    expect(expiry).toHaveAttribute("datetime", "2026-10-12T12:00:00.000Z");
  });

  it("shows the post-it-yourself badge for networks we cannot publish to", async () => {
    svc.listPostingAgentDrafts.mockResolvedValue([{ ...pendingDraft, postYourself: true, destination: "tiktok" }]);
    renderTab();
    expect(
      await screen.findByText("Post this yourself — hired.video cannot publish directly to this network."),
    ).toBeInTheDocument();
  });

  it("shows Prepare clips and blocks Approve when a draft still needs a fitted cut", async () => {
    svc.listPostingAgentDrafts.mockResolvedValue([
      { ...pendingDraft, needsClip: true, variantKey: "feed:9x16" },
    ]);
    renderTab();
    expect(await screen.findByRole("button", { name: "Prepare clips" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Approve all" })).toBeDisabled();
    expect(screen.getByText("This draft still needs a fitted cut.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Prepare clips" }));
    await waitFor(() =>
      expect(prepareClip).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "proj-1", variantKey: "feed:9x16" }),
      ),
    );
    await waitFor(() => expect(svc.preparePostingAgentDraft).toHaveBeenCalledWith("draft-1", "variant-1"));
  });

  it("links to Studio when the agent is out of material", async () => {
    svc.getPostingAgentSettings.mockResolvedValue({ ...settings, pausedReason: "out_of_material" });
    renderTab();
    const link = await screen.findByRole("link", { name: "Open Studio" });
    expect(link).toHaveAttribute("href", "/studio/new");
    expect(screen.getByText(/ran out of fresh clips/i)).toBeInTheDocument();
  });
});
