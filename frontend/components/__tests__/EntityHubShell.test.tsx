// EntityHubShell visibility tests — confirm role-aware tab filtering and
// the SA-superset invariant. Mocks usePermissions to vary the viewer's
// effective role.
//
// Run: vitest run components/__tests__/EntityHubShell.test.tsx

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FileText, Search, UserCheck } from "lucide-react";
import EntityHubShell, { type EntityHubTab } from "@/components/EntityHubShell";
import { USER_ROLES, type UserRole } from "@shared/user-roles";

// Mock the AppShell wrapper — we don't care about its layout in this
// isolation test; render its children directly. The real shell wraps
// the content with sidebar / nav chrome.
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="appshell">{children}</div>,
}));

// usePermissions is the only role surface EntityHubShell consumes. Each
// test sets `currentRole` then renders.
let currentRole: UserRole = USER_ROLES.JOB_SEEKER;
vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: () => ({ effectiveRole: currentRole }),
}));

const tabs: EntityHubTab[] = [
  {
    key: "mine",
    label: "My Resumes",
    icon: FileText,
    roles: [USER_ROLES.JOB_SEEKER],
    title: "Your Resumes",
    description: "owner-side",
    body: <div data-testid="body-mine">mine-body</div>,
  },
  {
    key: "available",
    label: "Available",
    icon: Search,
    roles: [USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.ADMIN],
    title: "Available Resumes",
    description: "discovery",
    body: <div data-testid="body-available">available-body</div>,
  },
  {
    key: "sourced",
    label: "Sourced",
    icon: UserCheck,
    roles: [USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.ADMIN],
    title: "Sourced Candidates",
    description: "agency-pool",
    body: <div data-testid="body-sourced">sourced-body</div>,
  },
];

function mount(initialUrl = "/resumes") {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <EntityHubShell entity="resume" tabs={tabs} defaultTab="mine" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  currentRole = USER_ROLES.JOB_SEEKER;
});

describe("EntityHubShell — tab visibility per role", () => {
  it("job_seeker sees only the mine tab and renders its body by default", () => {
    currentRole = USER_ROLES.JOB_SEEKER;
    mount();
    expect(screen.getByText("My Resumes")).toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
    expect(screen.queryByText("Sourced")).not.toBeInTheDocument();
    expect(screen.getByTestId("body-mine")).toBeInTheDocument();
  });

  it("recruiter sees Available + Sourced and lands on Available by default (mine not visible)", () => {
    currentRole = USER_ROLES.RECRUITER;
    mount();
    expect(screen.queryByText("My Resumes")).not.toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Sourced")).toBeInTheDocument();
    // defaultTab=mine isn't visible to recruiter — falls through to first
    // visible tab, which is Available
    expect(screen.getByTestId("body-available")).toBeInTheDocument();
    expect(screen.queryByTestId("body-sourced")).not.toBeInTheDocument();
  });

  it("employer sees Available + Sourced (employers also use the pool)", () => {
    currentRole = USER_ROLES.EMPLOYER;
    mount();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Sourced")).toBeInTheDocument();
    expect(screen.queryByText("My Resumes")).not.toBeInTheDocument();
  });

  it("super_admin sees the union of every tab — SA bypass", () => {
    currentRole = USER_ROLES.SUPER_ADMIN;
    mount();
    expect(screen.getByText("My Resumes")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Sourced")).toBeInTheDocument();
  });

  it("?tab=sourced selects the sourced body when visible to the role", () => {
    currentRole = USER_ROLES.RECRUITER;
    mount("/resumes?tab=sourced");
    expect(screen.getByTestId("body-sourced")).toBeInTheDocument();
    expect(screen.queryByTestId("body-available")).not.toBeInTheDocument();
  });

  it("?tab=mine on a recruiter falls through to first visible tab (no broken empty state)", () => {
    currentRole = USER_ROLES.RECRUITER;
    mount("/resumes?tab=mine");
    // recruiter has no `mine` tab — shell picks defaultTab if visible,
    // else first visible. defaultTab=mine isn't visible → fall through.
    expect(screen.getByTestId("body-available")).toBeInTheDocument();
    expect(screen.queryByText("My Resumes")).not.toBeInTheDocument();
  });
});
