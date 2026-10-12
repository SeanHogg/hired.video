// useProfileSectionSaver — single source of truth for the
// "save → refreshUser → onSaved → close" flow that every profile section
// dialog (Header, About, Contact, SocialProfiles, Skills, CustomUrl)
// duplicated in open code. Extracted in gap #370 per the DRY rule.
//
// Each dialog owns its own form state + computes its `updates` payload;
// this hook owns the side-effects (loading flag, persistence call,
// auth-context refresh, parent notification, dialog close, error log).

import { useState } from "react";
import { useAuth } from "@/lib/auth";

interface UseProfileSectionSaverOpts {
  /** Called after a successful save — typically a parent's optimistic
   *  refresh of the profile page (the auth-context's `refreshUser` is
   *  fired in parallel so the global nav avatar updates too). */
  onSaved?: () => void;
  /** The dialog's `onOpenChange` — invoked with `false` after a
   *  successful save so the dialog closes itself. */
  onClose: (open: false) => void;
  /** Human-friendly error label used in the console diagnostic. Defaults
   *  to "profile section" for surfaces that don't bother to name
   *  themselves. */
  errorLabel?: string;
}

export interface ProfileSectionSaver {
  saving: boolean;
  /** Persist `updates` via `updateProfile`, refresh the auth context,
   *  call `onSaved`, then close the dialog. Errors are swallowed into
   *  the console (the call sites previously had the exact same pattern)
   *  so the user sees the modal stay open without an alert. */
  save: (updates: Record<string, unknown>) => Promise<void>;
  /** Lower-level escape hatch for dialogs that persist via a non-
   *  `updateProfile` path (e.g. `userService.updateSlug` on
   *  EditCustomUrl) or for non-closing sub-saves like the in-dialog
   *  avatar swap on EditHeader (`closeOnSuccess: false`). Runs the
   *  same loading-flag + refresh + onSaved envelope around any
   *  caller-supplied async block. */
  runSave: (op: () => Promise<void>, opts?: { closeOnSuccess?: boolean }) => Promise<void>;
}

export function useProfileSectionSaver({
  onSaved,
  onClose,
  errorLabel = "profile section",
}: UseProfileSectionSaverOpts): ProfileSectionSaver {
  const { updateProfile, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);

  const runSave = async (
    op: () => Promise<void>,
    opts: { closeOnSuccess?: boolean } = {},
  ) => {
    const closeOnSuccess = opts.closeOnSuccess ?? true;
    try {
      setSaving(true);
      await op();
      refreshUser().catch(() => {});
      onSaved?.();
      if (closeOnSuccess) onClose(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to save ${errorLabel}:`, err);
    } finally {
      setSaving(false);
    }
  };

  const save = (updates: Record<string, unknown>) =>
    runSave(() => updateProfile(updates));

  return { saving, save, runSave };
}
