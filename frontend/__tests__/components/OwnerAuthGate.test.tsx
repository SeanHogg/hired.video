/**
 * OwnerAuthGate (#887) — the one sign-in mask for creator-output detail
 * pages (/resumes/:id wraps its content in it). A signed-out visitor sees
 * the owner's content with NO log-wall when the owner turned promotion on
 * (Settings → Privacy → promoteWithoutAuth, sent by the résumé read as
 * `ownerPromoteWithoutAuth`); otherwise the mask stays up.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const auth = vi.hoisted(() => ({ isAuthenticated: false }));

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ isAuthenticated: auth.isAuthenticated }) }));
vi.mock("@/components/AuthOverlay", () => ({
  default: ({ contentType }: { contentType: string }) => <div data-testid="auth-overlay">{contentType}</div>,
}));

import { OwnerAuthGate } from "@/components/auth/OwnerAuthGate";

function renderResume(promoteWithoutAuth: boolean | null | undefined) {
  return render(
    <OwnerAuthGate promoteWithoutAuth={promoteWithoutAuth} contentType="resume" title="Dana Okafor — Product Designer">
      <h1>Dana Okafor — Product Designer</h1>
    </OwnerAuthGate>,
  );
}

describe("OwnerAuthGate", () => {
  beforeEach(() => {
    auth.isAuthenticated = false;
  });

  it("shows a signed-out visitor the résumé with no log-wall when the owner promotes it", () => {
    renderResume(true);
    expect(screen.getByRole("heading", { name: "Dana Okafor — Product Designer" })).toBeInTheDocument();
    expect(screen.queryByTestId("auth-overlay")).not.toBeInTheDocument();
  });

  it("masks it for a signed-out visitor when the owner hasn't turned promotion on", () => {
    renderResume(false);
    expect(screen.getByTestId("auth-overlay")).toHaveTextContent("resume");
  });

  it("stays masked while the owner flag hasn't arrived (boundary: safe default)", () => {
    renderResume(undefined);
    expect(screen.getByTestId("auth-overlay")).toBeInTheDocument();
  });

  it("never masks a signed-in viewer", () => {
    auth.isAuthenticated = true;
    renderResume(false);
    expect(screen.queryByTestId("auth-overlay")).not.toBeInTheDocument();
  });
});
