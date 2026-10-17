import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import { USER_ROLES } from "@shared/user-roles";
import { useCreatorMine } from "@/hooks/queries/use-creator";
import CreatorEnrollmentWizard from "@/components/creator/CreatorEnrollmentWizard";

/**
 * Self-gating prompt that nudges a `creator`-role account to finish Creator
 * Program enrollment (#2002). Signing up via the /services "Become a Creator"
 * page sets `role=creator` + channel mode, but marketplace listings still
 * require a per-program opt-in (terms acceptance) — until then the account is
 * reportable + channel-rendered but NOT visible in the creator marketplace
 * (`isCreatorVisible`). This card closes that loop from the creator's home.
 *
 * Renders nothing unless the viewer is a creator-role user with no active
 * enrollment row, so it can be dropped anywhere without a guard at the call
 * site (DRY — the component owns its own visibility) and disappears the moment
 * they enroll.
 */
export default function CreatorEnrollmentCTA() {
  const effectiveRole = useEffectiveRole();
  const [wizardOpen, setWizardOpen] = useState(false);

  const isCreatorRole = effectiveRole === USER_ROLES.CREATOR;

  const mine = useCreatorMine({ enabled: isCreatorRole });
  // null = still loading; a failed read counts as "not enrolled".
  const enrolled: boolean | null = mine.isError ? false : mine.isSuccess ? mine.data !== null : null;

  // Hidden for non-creators, while loading, and once enrolled.
  if (!isCreatorRole || enrolled !== false) return null;

  return (
    <>
      <Card className="border-pink-300/40 bg-primary">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">Finish setting up your Creator account</h3>
              <p className="text-sm text-muted-foreground">
                Pick what you'll offer — videos, voices, courses, templates, coaching — and
                accept the program terms to list on the marketplace and start earning.
              </p>
            </div>
          </div>
          <Button
            className="shrink-0 bg-primary hover:bg-primary/90"
            onClick={() => setWizardOpen(true)}
          >
            <Sparkles className="mr-1 h-4 w-4" />
            Complete setup
          </Button>
        </CardContent>
      </Card>

      <CreatorEnrollmentWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onEnrolled={() => setWizardOpen(false)}
      />
    </>
  );
}
