/**
 * The editor's form card (#1586): an inactive form — present in the owner
 * listing but skipped by playback — says it is turned off instead of
 * "Form not found"; a missing form still says not found.
 *
 * Run: vitest run __tests__/components/studio/VideoFormInlineBody.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ loaded: undefined as unknown }));

vi.mock("@/lib/studio/engagement/use-engagement-asset", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/studio/engagement/use-engagement-asset")>()),
  useEngagementAsset: () => h.loaded,
}));

import VideoFormInlineBody from "@/components/studio/v2/inline-bodies/VideoFormInlineBody";

const PROJECT_ID = "7d3e2f10-4b5a-4c6d-8e9f-0a1b2c3d4e5f";
const FORM = {
  id: "3f6c1d2e-8a41-4b6f-9a0e-2d5c7b9e1a44",
  projectId: PROJECT_ID,
  title: "Get the full case study",
  description: null,
  positionSeconds: 1,
  fields: [{ key: "email", label: "Work email", type: "email", required: true }],
  requireToContinue: true,
  redirectUrl: null,
  submitButtonText: "Send it to me",
  isActive: true,
  formType: "lead_capture",
};

beforeEach(() => {
  h.loaded = undefined;
});

describe("VideoFormInlineBody", () => {
  it("renders an active form's fields", () => {
    h.loaded = { kind: "video-form", form: FORM };
    render(<VideoFormInlineBody projectId={PROJECT_ID} assetId={FORM.id} />);
    expect(screen.getByText("Get the full case study")).toBeInTheDocument();
    expect(screen.getByText("Work email")).toBeInTheDocument();
    expect(screen.queryByText(/turned off/)).toBeNull();
  });

  it("says an inactive form is turned off, not missing", () => {
    h.loaded = { kind: "video-form", form: { ...FORM, isActive: false } };
    render(<VideoFormInlineBody projectId={PROJECT_ID} assetId={FORM.id} />);
    expect(screen.getByText("This form is turned off — viewers won't see it.")).toBeInTheDocument();
    expect(screen.getByText("Get the full case study")).toBeInTheDocument();
    expect(screen.queryByText("Form not found")).toBeNull();
  });

  it("still says not found when the form is gone", () => {
    h.loaded = null;
    render(<VideoFormInlineBody projectId={PROJECT_ID} assetId={FORM.id} />);
    expect(screen.getByText("Form not found")).toBeInTheDocument();
  });
});
