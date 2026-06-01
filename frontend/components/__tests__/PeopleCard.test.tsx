/**
 * Tests for PeopleCard's auth/ownership gating.
 *
 * Gating policy:
 *   - Engagement metrics (connections, followers, profile views) → owner only
 *   - Role/persona, location, active/joined timestamps → authenticated only
 *   - Public identity (name, headline, current position, company) → always
 *
 * Run: vitest run components/__tests__/PeopleCard.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithAppProviders } from "../../__tests__/test-render";
import React from "react";

// vi.mock is hoisted — can't reference closure variables. Use vi.hoisted so
// the mock fn is created before module evaluation and accessible below.
const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, useAuth: useAuthMock };
});

import PeopleCard from "@/components/PeopleCard";

const basePerson: any = {
  id: "p1",
  fullName: "Sean Hogg",
  firstName: "Sean",
  lastName: "Hogg",
  headline: "CTO & Technology Leader",
  avatar: "",
  location: "Troy, MI",
  role: "job_seeker",
  status: "active",
  currentCompany: "Independent",
  currentPosition: "Fractional CTO",
  companyName: "",
  connectionCount: 42,
  followerCount: 17,
  profileViews: 99,
  openToWork: true,
  emailConfirmed: true,
  isPro: false,
  lastActiveAt: "2026-04-10T00:00:00Z",
  createdAt: "2024-01-01T00:00:00Z",
  slug: "sean-hogg",
};

const renderCard = (props: any = {}) =>
  renderWithAppProviders(<PeopleCard person={basePerson} {...props} />);

// Tight regexes that target the Active/Joined row specifically ("Active "
// followed by a date) — avoids false positives from the "active" status badge.
const ACTIVE_ROW = /Active\s+\d/;
const JOINED_ROW = /Joined\s+\d/;

describe("PeopleCard — anonymous viewer", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ user: null, isAuthenticated: false });
  });

  it("hides engagement metrics (connections / followers / profile views)", () => {
    renderCard();
    expect(screen.queryByText(/Connections/i)).toBeNull();
    expect(screen.queryByText(/Followers/i)).toBeNull();
    expect(screen.queryByText(/profile views/i)).toBeNull();
  });

  it("hides role, location, and active/joined rows", () => {
    renderCard();
    expect(screen.queryByText(/Troy, MI/)).toBeNull();
    expect(screen.queryByText(ACTIVE_ROW)).toBeNull();
    expect(screen.queryByText(JOINED_ROW)).toBeNull();
  });

  it("still shows public identity (name, headline, current position)", () => {
    renderCard();
    expect(screen.getByText(/Sean Hogg/)).toBeInTheDocument();
    expect(screen.getByText(/CTO & Technology Leader/)).toBeInTheDocument();
    expect(screen.getByText(/Fractional CTO/)).toBeInTheDocument();
  });
});

describe("PeopleCard — authenticated non-owner viewer", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { id: "viewer-999", role: "job_seeker" },
      isAuthenticated: true,
    });
  });

  it("shows location and active/joined (authenticated-only block)", () => {
    renderCard();
    expect(screen.getByText(/Troy, MI/)).toBeInTheDocument();
    expect(screen.getByText(ACTIVE_ROW)).toBeInTheDocument();
    expect(screen.getByText(JOINED_ROW)).toBeInTheDocument();
  });

  it("still hides engagement metrics because viewer is not the owner", () => {
    renderCard();
    expect(screen.queryByText(/Connections/i)).toBeNull();
    expect(screen.queryByText(/Followers/i)).toBeNull();
    expect(screen.queryByText(/profile views/i)).toBeNull();
  });
});

describe("PeopleCard — owner viewer", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { id: "p1", role: "job_seeker" },
      isAuthenticated: true,
    });
  });

  it("shows engagement metrics", () => {
    renderCard();
    expect(screen.getByText(/Connections/i)).toBeInTheDocument();
    expect(screen.getByText(/Followers/i)).toBeInTheDocument();
    expect(screen.getByText(/profile views/i)).toBeInTheDocument();
  });

  it("renders the metric counts from the person payload", () => {
    renderCard();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText(/99 profile views/)).toBeInTheDocument();
  });

  it("still shows authenticated-only blocks (role/location/active-joined)", () => {
    renderCard();
    expect(screen.getByText(/Troy, MI/)).toBeInTheDocument();
    expect(screen.getByText(ACTIVE_ROW)).toBeInTheDocument();
    expect(screen.getByText(JOINED_ROW)).toBeInTheDocument();
  });
});
