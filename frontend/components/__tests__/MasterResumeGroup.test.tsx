/**
 * Regression test for the "0 views leak" bug on MasterResumeGroup.
 *
 * Before the fix: the master row and each variation rendered `<Eye />
 * {views}` unconditionally, so a non-owner viewing someone else's master
 * group would see engagement counts (usually "0", but still a leak).
 * After the fix: both view counts are wrapped in `{isOwned && ...}`.
 *
 * Run: vitest run components/__tests__/MasterResumeGroup.test.tsx
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

import MasterResumeGroupComponent from "@/components/MasterResumeGroup";
import type { MasterResumeGroup } from "@/lib/services/resume-service";

const makeGroup = (): MasterResumeGroup =>
  ({
    masterResume: {
      id: "m1",
      userId: "u1",
      name: "Master Resume",
      title: "Master Resume",
      slug: "master-resume",
      description: "",
      privacy_ShowResume: 0,
      isMaster: true,
      isActive: true,
      parentId: null,
      views: 7,
      createdAt: "2026-04-10T00:00:00Z",
      updatedAt: "2026-04-10T00:00:00Z",
      creationDateTime: "2026-04-10T00:00:00Z",
      updateDateTime: "2026-04-10T00:00:00Z",
      resumeSerialized: "{}",
      metaResume: { basics: { name: "Sean Hogg", label: "CTO" } },
    },
    variations: [
      {
        id: "v1",
        userId: "u1",
        name: "Variation 1",
        title: "Variation 1",
        slug: "variation-1",
        description: "",
        privacy_ShowResume: 10,
        isMaster: false,
        isActive: false,
        parentId: "m1",
        views: 3,
        createdAt: "2026-04-11T00:00:00Z",
        updatedAt: "2026-04-11T00:00:00Z",
        creationDateTime: "2026-04-11T00:00:00Z",
        updateDateTime: "2026-04-11T00:00:00Z",
        resumeSerialized: "{}",
        metaResume: { basics: { name: "Sean Hogg", label: "CTO" } },
      },
    ],
  }) as unknown as MasterResumeGroup;

const renderGroup = (props: { isOwned: boolean }) =>
  render(
    <MemoryRouter>
      <MasterResumeGroupComponent
        group={makeGroup()}
        isOwned={props.isOwned}
        onViewResume={vi.fn()}
        onCreateVariation={vi.fn()}
        onSetActive={vi.fn()}
        onEditResume={vi.fn()}
        onDeleteResume={vi.fn()}
      />
    </MemoryRouter>,
  );

describe("MasterResumeGroup — view counts", () => {
  it("shows master + variation view counts when owned", () => {
    renderGroup({ isOwned: true });
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("hides view counts when not owned", () => {
    renderGroup({ isOwned: false });
    expect(screen.queryByText("7")).toBeNull();
    expect(screen.queryByText("3")).toBeNull();
  });

  it("still renders the master slug even when not owned", () => {
    renderGroup({ isOwned: false });
    expect(screen.getByText(/master-resume/)).toBeInTheDocument();
  });
});
