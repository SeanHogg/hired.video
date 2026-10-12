/**
 * The page is the form (#1916 / #2101): with `inlineEdit`, the declarative
 * renderer's text fields edit in place on the same columned layout, and an
 * edit comes back as the content with ONLY that field changed (metaData and
 * skillEvidence untouched). A single click stays the host's (the kit's line
 * selection); a double-click starts typing. Read-only renders stay exactly
 * as they were.
 *
 * Run: vitest run components/resume-renderer/__tests__/inline-edit-roundtrip.test.tsx
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { writeAt } from "@shared/resume-path";
import type { ResumeContent } from "@shared/resume";
import DeclarativeResumeRenderer from "../DeclarativeResumeRenderer";
import { DEFAULT_DESCRIPTOR, type ResumeTemplateDescriptor } from "@/types/resume-template";
import type { Resume } from "@/types/resume";
import { WORK_STRIPE_ID, resumeFixture } from "@/lib/studio/document/__tests__/resume-fixture";

/** A two-column print template: projects + skills in the sidebar. */
const descriptor: ResumeTemplateDescriptor = {
  ...DEFAULT_DESCRIPTOR,
  documentMode: "print",
  layout: { columns: 2, sidebar: ["projects", "skills"] },
  sections: [
    { kind: "section", key: "work", enabled: true, title: "Work", layout: "timeline", showHighlights: true },
    { kind: "section", key: "projects", enabled: true, title: "Projects", layout: "cards" },
    { kind: "section", key: "skills", enabled: true, title: "Skills", layout: "list" },
  ],
};

function page(content: ResumeContent, onChange?: (next: ResumeContent) => void) {
  const resume = { id: "r1", title: "Sean Hogg", content } as unknown as Resume;
  return render(
    <DeclarativeResumeRenderer resume={resume} descriptor={descriptor} inlineEdit={onChange ? { content, onChange } : undefined} />,
  );
}

function field(container: HTMLElement, path: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-inline-path="${path}"]`);
  if (!el) throw new Error(`no inline field ${path}`);
  return el;
}

/** Double-click the field → the in-place editor that replaces it. */
function startTyping(container: HTMLElement, path: string): HTMLElement {
  fireEvent.doubleClick(field(container, path));
  const el = field(container, path);
  if (!el.hasAttribute("contenteditable")) throw new Error(`${path} did not enter typing`);
  return el;
}

describe("DeclarativeResumeRenderer inline-edit mode", () => {
  it("an edit on the page changes only that field of the content", () => {
    const content = resumeFixture();
    const onChange = vi.fn();
    const { container } = page(content, onChange);
    const position = startTyping(container, "work.0.position");
    position.textContent = "Staff Engineer";
    fireEvent.blur(position);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ResumeContent;
    expect(next).toEqual(writeAt(resumeFixture(), "work.0.position", "Staff Engineer"));
    expect(next.metaData).toBe(content.metaData);
    expect(next.skillEvidence).toBe(content.skillEvidence);
  });

  it("edits a bullet, a header field and a sidebar field in place", () => {
    const onChange = vi.fn();
    const { container } = page(resumeFixture(), onChange);
    for (const [path, value] of [
      ["work.0.highlights.0", "Cut p99 latency 45%"],
      ["basics.name", "Sean P. Hogg"],
      ["skills.0.name", "Python 3"],
    ] as const) {
      const el = startTyping(container, path);
      el.textContent = value;
      fireEvent.blur(el);
      expect(onChange).toHaveBeenLastCalledWith(writeAt(resumeFixture(), path, value));
    }
  });

  it("Escape restores the stored text and commits nothing; an unchanged blur commits nothing", () => {
    const onChange = vi.fn();
    const { container } = page(resumeFixture(), onChange);
    const el = startTyping(container, "projects.0.name");
    el.textContent = "typo";
    fireEvent.keyDown(el, { key: "Escape" });
    fireEvent.blur(el);
    expect(field(container, "projects.0.name").textContent).toBe("hired.video");
    expect(field(container, "projects.0.name").hasAttribute("contenteditable")).toBe(false);
    fireEvent.blur(startTyping(container, "basics.label"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a single click never starts typing and reaches the host; typing keeps its clicks", () => {
    const onChange = vi.fn();
    const onHostClick = vi.fn();
    const content = resumeFixture();
    const resume = { id: "r1", title: "Sean Hogg", content } as unknown as Resume;
    const { container } = render(
      <div onClick={onHostClick}>
        <DeclarativeResumeRenderer resume={resume} descriptor={descriptor} inlineEdit={{ content, onChange }} />
      </div>,
    );
    const idle = field(container, "work.0.highlights.0");
    fireEvent.click(idle);
    expect(idle.hasAttribute("contenteditable")).toBe(false);
    expect(onHostClick).toHaveBeenCalledTimes(1);
    expect(idle.getAttribute("title")).toBe("Double-click to edit");
    const typing = startTyping(container, "work.0.highlights.0");
    fireEvent.click(typing);
    expect(onHostClick).toHaveBeenCalledTimes(1);
  });

  it("Enter / F2 on a focused field starts typing (keyboard path)", () => {
    const { container } = page(resumeFixture(), vi.fn());
    fireEvent.keyDown(field(container, "basics.name"), { key: "F2" });
    expect(field(container, "basics.name").getAttribute("contenteditable")).toBe("plaintext-only");
  });

  it("marks entries with their stable id so a media drop can bind (#2153)", () => {
    const { container } = page(resumeFixture(), vi.fn());
    expect(container.querySelector(`[data-resume-item-id="${WORK_STRIPE_ID}"]`)).not.toBeNull();
  });

  it("read-only renders have no editable fields", () => {
    const { container, getByText } = page(resumeFixture());
    expect(container.querySelector("[data-inline-path]")).toBeNull();
    expect(container.querySelector("[contenteditable]")).toBeNull();
    expect(getByText("Senior Engineer")).toBeInTheDocument();
  });
});
