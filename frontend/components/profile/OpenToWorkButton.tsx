import { useState } from "react";
import { Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

interface Props {
  size?: "sm" | "default";
  label?: string;
  onAfterChange?: () => void;
}

// Self-gates: renders nothing if the user is already open-to-work (or signed
// out). Consumers can drop it into any "you should turn this on" surface
// without needing to compute visibility themselves.
export default function OpenToWorkButton({
  size = "sm",
  label = "Turn on Open to Work",
  onAfterChange,
}: Props) {
  const { user, updateProfile, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!user || user.openToWork) return null;

  const handle = async () => {
    setBusy(true);
    try {
      await updateProfile({ openToWork: true });
      await refreshUser();
      toast.success("Open to Work is on — you'll surface higher in recruiter search.");
      onAfterChange?.();
    } catch (err) {
      console.error("[OpenToWorkButton] failed", err);
      toast.error("Could not update. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size={size} variant="outline" onClick={handle} disabled={busy}>
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          Turning on...
        </>
      ) : (
        <>
          <Eye className="h-4 w-4 mr-1.5" />
          {label}
        </>
      )}
    </Button>
  );
}
