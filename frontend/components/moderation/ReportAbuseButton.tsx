/**
 * ReportAbuseButton — drop this on ANY entity surface (template card,
 * profile header, job listing, feed post, etc.) to give viewers a way
 * to flag content. The button + dialog + service call all live here so
 * consumers wire one line:
 *
 *   <ReportAbuseButton entityType="studio_template" entityId={t.id} />
 *
 * Self-gating (per the standing DRY rule):
 *   - Unauthenticated users see a "Sign in to report" affordance — we
 *     do NOT hide the button entirely, because invisible reporting
 *     is no reporting at all (a viewer is most likely to want to flag
 *     content they're not logged in to interact with).
 *   - Reporters cannot file against themselves — when the optional
 *     `entityOwnerId` matches the viewer, the button returns null
 *     (no "report your own work" UX). When the prop is omitted the
 *     server-side resolver fills the owner in at write time and the
 *     reporter still can't file twice (unique index).
 *
 * The button is intentionally subtle (ghost variant, flag icon) so
 * placement on hover-only surfaces is cheap. Override `triggerLabel` /
 * `triggerVariant` when the host needs a more prominent affordance.
 */
import { lazy, Suspense, useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import type { ReportEntityType } from "@shared/moderation";

const ReportAbuseDialog = lazy(() => import("./ReportAbuseDialog"));

interface Props {
  entityType: ReportEntityType;
  entityId: string;
  /** When known, lets the component self-gate the "you can't report
   *  your own content" case before showing the trigger. Optional — the
   *  backend also enforces this when it resolves the owner. */
  entityOwnerId?: string | null;
  /** Friendly noun rendered inside the dialog ("Report this template",
   *  "Report this resume"). Defaults to the entity-type label. */
  entityLabel?: string;
  /** Override the trigger's text. Default: "Report" (icon-only on tight
   *  surfaces — pass a label for buttons that need a wider hit area). */
  triggerLabel?: string;
  triggerVariant?: "ghost" | "outline" | "secondary";
  /** Optional callback fired after a successful filing — host surfaces
   *  can use it to refresh local state (e.g. show a "reported" pill). */
  onReported?: () => void;
}

export default function ReportAbuseButton({
  entityType,
  entityId,
  entityOwnerId,
  entityLabel,
  triggerLabel,
  triggerVariant = "ghost",
  onReported,
}: Props) {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Self-gate: never let the viewer report their own content.
  if (isAuthenticated && entityOwnerId && entityOwnerId === user?.id) return null;

  function handleClick() {
    if (!isAuthenticated) {
      // Anonymous reporting is intentionally unavailable — bounce to
      // sign-in and come back. The deep-link query loop runs through
      // the existing /login?next= pattern.
      navigate(
        `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={triggerVariant}
        onClick={handleClick}
        className="gap-1.5"
        aria-label={triggerLabel ?? "Report"}
        title="Report this content"
      >
        <Flag className="h-3.5 w-3.5" />
        {triggerLabel}
      </Button>

      {open && (
        <Suspense fallback={null}>
          <ReportAbuseDialog
            open={open}
            onOpenChange={setOpen}
            entityType={entityType}
            entityId={entityId}
            entityLabel={entityLabel}
            onReported={onReported}
          />
        </Suspense>
      )}
    </>
  );
}
