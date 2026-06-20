/**
 * Tests for the smart-default behaviors added to ResumeUpload:
 *   - "Mark as Master Resume" defaults to checked when the user has no
 *     resumes yet (mirrors the backend's auto-promote-first-resume rule).
 *   - "Mark as Master Resume" defaults to unchecked when resumes already exist.
 *   - `initialFile` prop renders the file row immediately and pre-fills the
 *     name field from the filename.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

const { getUserResumesMock, parseJsonResumeFileMock, extractTextFromFileMock } =
  vi.hoisted(() => ({
    getUserResumesMock: vi.fn(),
    parseJsonResumeFileMock: vi.fn(),
    extractTextFromFileMock: vi.fn(),
  }));

vi.mock("@/lib/services/resume-service", () => ({
  resumeService: {
    getUserResumes: getUserResumesMock,
    createResume: vi.fn(),
  },
}));

vi.mock("@/lib/extract-text", () => ({
  parseJsonResumeFile: parseJsonResumeFileMock,
  extractTextFromFile: extractTextFromFileMock,
  isResumeImageFile: (file: File) => file.type.startsWith("image/"),
}));

import ResumeUpload from "@/components/ResumeUpload";

const masterCheckbox = () =>
  document.getElementById("master-resume") as HTMLInputElement | null;

describe("ResumeUpload — smart isMaster default", () => {
  beforeEach(() => {
    getUserResumesMock.mockReset();
    parseJsonResumeFileMock.mockReset();
    parseJsonResumeFileMock.mockResolvedValue(null);
    extractTextFromFileMock.mockReset();
  });

  it("defaults Mark-as-Master to checked when the user has no resumes", async () => {
    getUserResumesMock.mockResolvedValue([]);
    render(<ResumeUpload onUploadSuccess={vi.fn()} onCancel={vi.fn()} compact />);
    await waitFor(() =>
      expect(masterCheckbox()?.getAttribute("data-state")).toBe("checked"),
    );
  });

  it("defaults Mark-as-Master to unchecked when resumes already exist", async () => {
    getUserResumesMock.mockResolvedValue([{ id: "r1" }]);
    render(<ResumeUpload onUploadSuccess={vi.fn()} onCancel={vi.fn()} compact />);
    // Wait for the hook to settle. The checkbox may already render as
    // unchecked, but we want to be sure the effect ran.
    await waitFor(() => expect(getUserResumesMock).toHaveBeenCalled());
    expect(masterCheckbox()?.getAttribute("data-state")).toBe("unchecked");
  });
});

describe("ResumeUpload — initialFile prop", () => {
  beforeEach(() => {
    getUserResumesMock.mockReset();
    getUserResumesMock.mockResolvedValue([]);
    parseJsonResumeFileMock.mockReset();
    parseJsonResumeFileMock.mockResolvedValue(null);
  });

  it("renders the file row immediately and pre-fills the name from the filename", async () => {
    const file = new File(["%PDF"], "Sean's Resume.pdf", {
      type: "application/pdf",
    });

    render(
      <ResumeUpload
        onUploadSuccess={vi.fn()}
        onCancel={vi.fn()}
        compact
        initialFile={file}
      />,
    );

    expect(screen.getByText("Sean's Resume.pdf")).toBeInTheDocument();

    await waitFor(() => {
      const nameInput = screen.getByLabelText("Resume Name") as HTMLInputElement;
      expect(nameInput.value).toBe("Sean's Resume");
    });
  });
});
