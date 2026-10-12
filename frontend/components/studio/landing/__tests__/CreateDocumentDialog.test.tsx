/**
 * #2221 — the create step: a résumé offers master or variant (variant only
 * once the viewer has a master) plus the shared template gallery; a job post
 * offers the gallery only; Create hands the choice to useDocumentCreate.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  importFiles: vi.fn(),
  masters: [] as Array<{ id: string; title: string }>,
}));
vi.mock("@/lib/studio/landing/use-document-create", () => ({
  useDocumentCreate: () => ({ start: mocks.start, busy: false }),
}));
vi.mock("@/lib/jobs/use-job-import", () => ({
  useJobImport: () => ({ importFiles: mocks.importFiles, importing: false }),
}));
vi.mock("@/lib/studio/landing/use-master-resumes", () => ({
  useMasterResumes: () => ({ masters: mocks.masters, loading: false }),
}));
// The gallery's own data hook hits the template marketplace; a stand-in
// exposes one pickable design per kind.
vi.mock("@/components/studio/document/DocumentTemplateGallery", () => ({
  default: ({ entityKind, onPick }: { entityKind: string; onPick: (o: unknown) => void }) => (
    <button type="button" onClick={() => onPick({ id: `${entityKind}-modern`, name: "Modern" })}>
      pick-{entityKind}
    </button>
  ),
}));

import CreateDocumentDialog from "../CreateDocumentDialog";

const MASTER_ID = "8b6f2c1e-0d6a-4b8e-9f3a-2c7d5e1a9b40";

beforeEach(() => {
  mocks.start.mockReset().mockResolvedValue(undefined);
  mocks.importFiles.mockReset().mockResolvedValue(true);
  mocks.masters = [];
});

describe("CreateDocumentDialog", () => {
  it("résumé, no masters yet: variant is offered but disabled; Create starts a master", async () => {
    const onOpenChange = vi.fn();
    render(<CreateDocumentDialog kind="resume" onOpenChange={onOpenChange} />);
    expect(screen.getByText("New résumé")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Variant of a master/ })).toBeDisabled();
    expect(screen.getByText("Make a master résumé first, then branch variants from it.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledWith("resume", null, { mode: "master" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("résumé with a master: branch a variant wearing the picked design", async () => {
    mocks.masters = [{ id: MASTER_ID, title: "Product Manager — master" }];
    render(<CreateDocumentDialog kind="resume" onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /Variant of a master/ }));
    fireEvent.click(screen.getByRole("button", { name: "pick-resume" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await vi.waitFor(() =>
      expect(mocks.start).toHaveBeenCalledWith(
        "resume",
        { id: "resume-modern", name: "Modern" },
        { mode: "variant", parentId: MASTER_ID, parentTitle: "Product Manager — master" },
      ),
    );
  });

  it("job post: no master / variant choice, just the design", async () => {
    render(<CreateDocumentDialog kind="job" onOpenChange={vi.fn()} />);
    expect(screen.queryByText("Start as")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "pick-job" }));
    fireEvent.click(screen.getByRole("button", { name: "Start blank" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledWith("job", null, { mode: "master" }));
  });

  it("job post: a PDF picked for import becomes a draft (the create form's upload)", async () => {
    const onOpenChange = vi.fn();
    render(<CreateDocumentDialog kind="job" onOpenChange={onOpenChange} />);
    const file = new File(["Staff Product Manager — own onboarding"], "staff-pm.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Upload a file"), { target: { files: [file] } });
    await vi.waitFor(() => expect(mocks.importFiles).toHaveBeenCalledWith([file]));
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.getByRole("button", { name: /Download CSV template/ })).toBeInTheDocument();
  });

  it("résumé: no job import offered", () => {
    render(<CreateDocumentDialog kind="resume" onOpenChange={vi.fn()} />);
    expect(screen.queryByText("Import a job post")).toBeNull();
  });

  it("closed (no kind) renders nothing", () => {
    const { container } = render(<CreateDocumentDialog kind={null} onOpenChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
