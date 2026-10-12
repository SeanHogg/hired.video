import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

// Single source of truth for the open-to-work mutation flow. Used by the
// inline button on /tools/profile-audit and the Switch on Settings →
// Job Preferences so both paths share the same toast copy, the same
// `updateProfile + refreshUser` sequence, and the same busy state.
export function useOpenToWorkToggle() {
  const { user, updateProfile, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);

  const setOpenToWork = async (value: boolean) => {
    setBusy(true);
    try {
      await updateProfile({ openToWork: value });
      await refreshUser();
      toast.success(
        value
          ? "Open to Work is on — you'll surface higher in recruiter search."
          : "Open to Work turned off.",
      );
    } catch (err) {
      console.error("[useOpenToWorkToggle] failed", err);
      toast.error("Could not update. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return {
    user,
    openToWork: !!user?.openToWork,
    busy,
    setOpenToWork,
  };
}
