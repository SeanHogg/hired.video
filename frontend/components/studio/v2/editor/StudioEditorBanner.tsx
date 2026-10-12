/**
 * The studio editor's banner region and its signed-out wall. Lifted out of
 * StudioEditorV2.
 */
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { StudioSubject } from "@shared/studio-subject";
import type { VideoScript } from "@/types/video-script";
import type { AuthGateSheetState } from "@/lib/hooks/use-auth-gate-state";
import { AuthGateSheet } from "@/components/auth/useAuthGate";
import { Button } from "@/components/ui/button";
import SubjectSeedBanner from "@/components/studio/v2/SubjectSeedBanner";

export interface StudioEditorBannerProps {
  /** The anon-adoption gate's sheet state (useAnonAdoption). */
  gateSheet: AuthGateSheetState;
  missingProject: boolean;
  subject: StudioSubject | null;
  canvasEmpty: boolean;
  onSeed: (script: VideoScript) => void;
}

export function StudioEditorBanner({ gateSheet, missingProject, subject, canvasEmpty, onSeed }: StudioEditorBannerProps) {
  const { t } = useTranslation();
  return (
    <>
      {/* Anon adoption (#2212): the in-place Sign in / Create account
          panel for a gated Save / Publish / Export (or an AI / upload
          action via AnonGateContext); resumes the action once signed in. */}
      <AuthGateSheet {...gateSheet} />
      {missingProject && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <p className="font-medium">{t("studio.editor.missingProjectTitle")}</p>
          <p className="mt-0.5 text-xs opacity-80">{t("studio.editor.missingProjectDesc")}</p>
        </div>
      )}
      {/* Subject deep-link banner (#650): an AI pre-fill from the linked
          entity while the canvas is empty; self-hides once widgets land. */}
      <SubjectSeedBanner subject={subject} canvasEmpty={canvasEmpty} onSeed={onSeed} />
    </>
  );
}

/** An existing `/studio/:id` requires sign-in — the project can only load
 *  for its owner, so there is nothing for an anonymous visitor to edit. */
export function StudioSignInWall() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-lg font-medium">{t("studio.editor.signInPrompt")}</p>
      <Button onClick={() => navigate("/login")}>{t("actions.signIn")}</Button>
    </div>
  );
}
