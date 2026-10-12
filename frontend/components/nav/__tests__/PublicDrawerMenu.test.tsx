import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PublicDrawerMenu } from "../PublicDrawerMenu";

const theme = { resolvedTheme: "light", select: vi.fn() };
vi.mock("@/lib/theme/use-theme-preference", () => ({ useThemePreference: () => theme }));

function renderAt(path: string, onNavigate = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PublicDrawerMenu onNavigate={onNavigate} />
    </MemoryRouter>,
  );
  return onNavigate;
}

describe("PublicDrawerMenu — signed-out phone menu", () => {
  beforeEach(() => {
    theme.resolvedTheme = "light";
    theme.select.mockReset();
  });

  it("lists the five header links in order", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Watch", "/#watch"],
      ["How it works", "/#how-it-works"],
      ["Tools", "/tools"],
      ["Templates", "/templates"],
      ["Pricing", "/pricing"],
    ]);
  });

  it("marks the current page", () => {
    renderAt("/pricing");
    expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Watch" })).not.toHaveAttribute("aria-current");
  });

  it("puts Rewards and the Dark mode switch below the links", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: "Rewards" })).toHaveAttribute("href", "/rewards");
    const dark = screen.getByRole("button", { name: "Dark mode" });
    expect(dark).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(dark);
    expect(theme.select).toHaveBeenCalledWith("dark");
  });

  it("switches back to light when dark mode is on", () => {
    theme.resolvedTheme = "dark";
    renderAt("/");
    const dark = screen.getByRole("button", { name: "Dark mode" });
    expect(dark).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(dark);
    expect(theme.select).toHaveBeenCalledWith("light");
  });

  it("ends with Sign in + Make your video, and closes the menu on navigation", () => {
    const onNavigate = renderAt("/");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    const cta = screen.getByRole("link", { name: "Make your video" });
    expect(cta).toHaveAttribute("href", "/studio/new");
    fireEvent.click(screen.getByRole("link", { name: "Watch" }));
    expect(onNavigate).toHaveBeenCalled();
  });
});
