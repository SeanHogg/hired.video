/**
 * Tests for ResumeEmptyDropzone — the reusable empty-state drop target used
 * on /resumes, in the Studio wizard, and in the Video Resume wizard.
 *
 * The sheet itself is mocked so these tests focus on the dropzone's own
 * concerns: rendering, drag-drop file capture, and prop wiring (initialFile +
 * onSuccess) into the sheet.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

const { sheetMock } = vi.hoisted(() => ({
  sheetMock: vi.fn(),
}));

vi.mock("@/components/ResumeUploadSheet", () => ({
  __esModule: true,
  default: (props: any) => {
    sheetMock(props);
    return null;
  },
}));

import ResumeEmptyDropzone from "@/components/ResumeEmptyDropzone";

const lastSheetCall = () =>
  sheetMock.mock.calls[sheetMock.mock.calls.length - 1]?.[0];

describe("ResumeEmptyDropzone", () => {
  beforeEach(() => {
    sheetMock.mockClear();
  });

  it("renders the title and description", () => {
    render(
      <ResumeEmptyDropzone
        onUploadSuccess={vi.fn()}
        title="Custom title"
        description="Custom description"
      />,
    );
    expect(screen.getByText("Custom title")).toBeInTheDocument();
    expect(screen.getByText("Custom description")).toBeInTheDocument();
  });

  it("falls back to default copy when title/description aren't provided", () => {
    render(<ResumeEmptyDropzone onUploadSuccess={vi.fn()} />);
    expect(screen.getByText("No resumes yet")).toBeInTheDocument();
    expect(screen.getByText(/Drop your resume here/i)).toBeInTheDocument();
  });

  it("only shows the Create Resume button when onCreateResume is supplied", () => {
    const { rerender } = render(
      <ResumeEmptyDropzone onUploadSuccess={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /Create Resume/i })).toBeNull();

    rerender(
      <ResumeEmptyDropzone onUploadSuccess={vi.fn()} onCreateResume={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: /Create Resume/i }),
    ).toBeInTheDocument();
  });

  it("invokes onCreateResume when its button is clicked", () => {
    const onCreateResume = vi.fn();
    render(
      <ResumeEmptyDropzone
        onUploadSuccess={vi.fn()}
        onCreateResume={onCreateResume}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Create Resume/i }));
    expect(onCreateResume).toHaveBeenCalledTimes(1);
  });

  it("opens the sheet without an initialFile when Upload Resume is clicked", () => {
    render(<ResumeEmptyDropzone onUploadSuccess={vi.fn()} />);
    expect(lastSheetCall().open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Upload Resume/i }));
    expect(lastSheetCall().open).toBe(true);
    expect(lastSheetCall().initialFile).toBeNull();
  });

  it("prefills the sheet with the dropped file when a file is dropped", () => {
    render(<ResumeEmptyDropzone onUploadSuccess={vi.fn()} />);
    const dropTarget = screen.getByText("No resumes yet").closest("div")!;
    const file = new File(["hello"], "resume.pdf", {
      type: "application/pdf",
    });

    fireEvent.drop(dropTarget, {
      dataTransfer: { files: [file] },
    });

    expect(lastSheetCall().open).toBe(true);
    expect(lastSheetCall().initialFile).toBe(file);
  });

  it("forwards the upload response to the consumer's onUploadSuccess", () => {
    const onUploadSuccess = vi.fn();
    render(<ResumeEmptyDropzone onUploadSuccess={onUploadSuccess} />);
    const response = {
      id: "r-new",
      content: {} as any,
      message: "ok",
      confidence: 1,
    };
    lastSheetCall().onSuccess(response);
    expect(onUploadSuccess).toHaveBeenCalledWith(response);
  });

  it("clears the pending file after the sheet closes", () => {
    render(<ResumeEmptyDropzone onUploadSuccess={vi.fn()} />);
    const dropTarget = screen.getByText("No resumes yet").closest("div")!;
    const file = new File(["x"], "r.pdf", { type: "application/pdf" });
    fireEvent.drop(dropTarget, { dataTransfer: { files: [file] } });
    expect(lastSheetCall().initialFile).toBe(file);

    act(() => {
      lastSheetCall().onOpenChange(false);
    });

    expect(lastSheetCall().open).toBe(false);
    expect(lastSheetCall().initialFile).toBeNull();
  });
});
