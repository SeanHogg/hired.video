/**
 * ListEntry draws its subtitle line only when it has text — no empty
 * wrapper under a role with no company — except on the inline-edit page,
 * where the empty line stays so it can be typed into.
 *
 * Run: vitest run components/resume-renderer/__tests__/list-entry-subtitle.test.tsx
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { THEMES } from "@/lib/resume-template-themes";
import { resumeFixture } from "@/lib/studio/document/__tests__/resume-fixture";
import { ListEntry } from "../entry-primitives";
import { EditableText, ResumeInlineEditProvider } from "../inline-edit";

const theme = THEMES["hired-purple"];

function row(name: string) {
  return (
    <ListEntry
      title={<EditableText path="work.1.position">Junior Engineer</EditableText>}
      subtitle={<EditableText path="work.1.name">{name}</EditableText>}
      subtitleText={name}
      startDate="2018-01-01"
      endDate="2019-12-31"
      theme={theme}
      basePath="work.1"
    />
  );
}

const subtitleLines = (c: HTMLElement) => c.querySelectorAll(`div.text-sm.${theme.accentText}`);

describe("ListEntry subtitle", () => {
  it("renders the line when the subtitle has text", () => {
    const { container, getByText } = render(row("Acme"));
    expect(getByText("Acme")).toBeInTheDocument();
    expect(subtitleLines(container)).toHaveLength(1);
  });

  it("renders no wrapper for an empty or whitespace subtitle (as uploads store it)", () => {
    for (const empty of ["", "   "]) {
      const { container, unmount } = render(row(empty));
      expect(subtitleLines(container)).toHaveLength(0);
      unmount();
    }
  });

  it("keeps the empty line on the inline-edit page so it can be typed", () => {
    const { container } = render(
      <ResumeInlineEditProvider value={{ content: resumeFixture(), onChange: vi.fn() }}>{row("")}</ResumeInlineEditProvider>,
    );
    expect(container.querySelector('[data-inline-path="work.1.name"]')).not.toBeNull();
  });
});
