/**
 * #2145 — retry button for failed transcription jobs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TranscriptionStatus } from "../TranscriptionStatus";
import type { TranscriptionJobResponse } from "../TranscriptionStatus";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast }));

function video(overrides: Partial<TranscriptionJobResponse> = {}): TranscriptionJobResponse {
  return {
    id: "resp-1",
    responseMode: "video",
    videoUrl: "https://cdn.example/a.webm",
    transcriptionStatus: "failed",
    ...overrides,
  };
}

describe("<TranscriptionStatus />", () => {
  const onRefresh = vi.fn();
  const retranscribe = vi.fn();

  beforeEach(() => {
    onRefresh.mockReset();
    retranscribe.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("renders nothing for a text answer", () => {
    const { container } = render(
      <TranscriptionStatus
        interviewId="iv-1"
        response={video({ responseMode: "text", videoUrl: null, transcriptionStatus: "failed" })}
        onRefresh={onRefresh}
        retranscribe={retranscribe}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the video has no url", () => {
    const { container } = render(
      <TranscriptionStatus
        interviewId="iv-1"
        response={video({ videoUrl: null })}
        onRefresh={onRefresh}
        retranscribe={retranscribe}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when transcription completed", () => {
    const { container } = render(
      <TranscriptionStatus
        interviewId="iv-1"
        response={video({ transcriptionStatus: "completed" })}
        onRefresh={onRefresh}
        retranscribe={retranscribe}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when status is unset (legacy row)", () => {
    const { container } = render(
      <TranscriptionStatus
        interviewId="iv-1"
        response={video({ transcriptionStatus: null })}
        onRefresh={onRefresh}
        retranscribe={retranscribe}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows a retry button when the job failed", () => {
    render(
      <TranscriptionStatus
        interviewId="iv-1"
        response={video()}
        onRefresh={onRefresh}
        retranscribe={retranscribe}
      />,
    );
    expect(screen.getByText("Transcription failed after automatic retries.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry transcription/i })).toBeEnabled();
  });

  it("queues a retry, toasts, and refreshes", async () => {
    const user = userEvent.setup();
    retranscribe.mockResolvedValue(undefined);
    onRefresh.mockResolvedValue(undefined);

    render(
      <TranscriptionStatus
        interviewId="iv-1"
        response={video()}
        onRefresh={onRefresh}
        retranscribe={retranscribe}
      />,
    );
    await user.click(screen.getByRole("button", { name: /retry transcription/i }));

    await waitFor(() => {
      expect(retranscribe).toHaveBeenCalledWith("iv-1", "resp-1");
    });
    expect(toast.success).toHaveBeenCalledWith("Transcription restarted.");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("toasts the error and does not refresh when retry fails", async () => {
    const user = userEvent.setup();
    retranscribe.mockRejectedValue(new Error("already pending"));

    render(
      <TranscriptionStatus
        interviewId="iv-1"
        response={video()}
        onRefresh={onRefresh}
        retranscribe={retranscribe}
      />,
    );
    await user.click(screen.getByRole("button", { name: /retry transcription/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("already pending");
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("toasts the generic copy when retry throws a non-Error", async () => {
    const user = userEvent.setup();
    retranscribe.mockRejectedValue("nope");

    render(
      <TranscriptionStatus
        interviewId="iv-1"
        response={video()}
        onRefresh={onRefresh}
        retranscribe={retranscribe}
      />,
    );
    await user.click(screen.getByRole("button", { name: /retry transcription/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Couldn't restart transcription.");
    });
  });

  it("shows pending copy and Check again (does not call retranscribe)", async () => {
    const user = userEvent.setup();
    render(
      <TranscriptionStatus
        interviewId="iv-1"
        response={video({ transcriptionStatus: "pending" })}
        onRefresh={onRefresh}
        retranscribe={retranscribe}
      />,
    );
    expect(screen.getByText("Transcribing this answer…")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /check again/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(retranscribe).not.toHaveBeenCalled();
  });
});
