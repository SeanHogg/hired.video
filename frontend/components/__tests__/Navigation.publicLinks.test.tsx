import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Navigation from "../Navigation";

const authState = { isAuthenticated: false };
vi.mock("@/lib/auth", () => ({ useAuth: () => authState }));

// Chrome with its own data/providers — irrelevant to the link list.
vi.mock("@/components/HeaderSearch", () => ({ default: () => null }));
vi.mock("@/components/cart/CartPanel", () => ({ default: () => null }));
vi.mock("@/components/UserMenu", () => ({ UserMenu: () => <div data-testid="user-menu" /> }));
vi.mock("@/components/EmulationBar", () => ({
  EmulationExpiryWatcher: () => null,
  useEmulationStyle: () => null,
}));
vi.mock("@/components/chrome/HeaderActions", () => ({ HeaderActionsOutlet: () => null }));
vi.mock("@/components/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/BrandHeader", () => ({ BrandLogo: () => <span>hired.video</span> }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Navigation />
    </MemoryRouter>,
  );
}

function headerLinks() {
  return within(screen.getAllByRole("list")[0]).getAllByRole("link");
}

describe("Navigation — signed-out header", () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
  });

  it("shows Watch · How it works · Tools · Templates · Pricing with their hrefs", () => {
    renderAt("/templates");
    expect(headerLinks().map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Watch", "/#watch"],
      ["How it works", "/#how-it-works"],
      ["Tools", "/tools"],
      ["Templates", "/templates"],
      ["Pricing", "/pricing"],
    ]);
  });

  it("no longer carries Rewards in the top bar", () => {
    renderAt("/");
    expect(screen.queryByRole("link", { name: "Rewards" })).toBeNull();
  });

  it("marks only the current page link with aria-current", () => {
    renderAt("/templates");
    const current = headerLinks().filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual(["Templates"]);
  });

  it("highlights nothing on the home page", () => {
    renderAt("/");
    expect(headerLinks().some((a) => a.hasAttribute("aria-current"))).toBe(false);
  });

  it("offers Sign in and Make your video (into the build flow) instead of Start free", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Make your video" })).toHaveAttribute("href", "/studio/new");
    expect(screen.queryByText("Start free")).toBeNull();
  });
});

describe("Navigation — signed-in header", () => {
  it("is unchanged: no marketing links or account CTAs, just the avatar", () => {
    authState.isAuthenticated = true;
    renderAt("/templates");
    expect(screen.queryByRole("link", { name: "Watch" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Make your video" })).toBeNull();
    expect(screen.getByTestId("user-menu")).toBeInTheDocument();
  });
});
