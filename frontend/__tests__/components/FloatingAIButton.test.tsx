import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FloatingAIButton from "@/components/FloatingAIButton";
import { AIProvider, useDockedAIChat } from "@/lib/ai-context";

function DockedChat() {
  useDockedAIChat();
  return <div>docked-chat</div>;
}

function renderAt(path: string, withDockedChat: boolean) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AIProvider>
        {withDockedChat && <DockedChat />}
        <FloatingAIButton />
      </AIProvider>
    </MemoryRouter>,
  );
}

const launcher = () => screen.queryByRole("button");

describe("FloatingAIButton — only one Brain on screen", () => {
  it("shows on an ordinary page", () => {
    renderAt("/dashboard", false);
    expect(launcher()).toBeTruthy();
  });

  it("hides while a page docks its own AI chat", () => {
    renderAt("/dashboard", true);
    expect(screen.getByText("docked-chat")).toBeTruthy();
    expect(launcher()).toBeNull();
  });

  it("comes back once the docked chat unmounts", () => {
    const { rerender } = renderAt("/dashboard", true);
    expect(launcher()).toBeNull();
    rerender(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AIProvider>
          <FloatingAIButton />
        </AIProvider>
      </MemoryRouter>,
    );
    expect(launcher()).toBeTruthy();
  });

  it("hides on the Studio workspace (a new kit at /studio/new)", () => {
    renderAt("/studio/new", false);
    expect(launcher()).toBeNull();
  });

  it("hides on a résumé's kit (/studio/resume/:resumeId)", () => {
    renderAt("/studio/resume/r1", false);
    expect(launcher()).toBeNull();
  });
});
