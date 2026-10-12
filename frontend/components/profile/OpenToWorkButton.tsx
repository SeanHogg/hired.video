import { Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOpenToWorkToggle } from "@/lib/hooks/use-open-to-work";

interface Props {
  size?: "sm" | "default";
  label?: string;
  onAfterChange?: () => void;
}

// Self-gates: renders nothing if the user is already open-to-work (or signed
// out). Drop it into any "you should turn this on" surface — the consumer
// doesn't compute visibility.
export default function OpenToWorkButton({
  size = "sm",
  label = "Turn on Open to Work",
  onAfterChange,
}: Props) {
  const { user, openToWork, busy, setOpenToWork } = useOpenToWorkToggle();

  if (!user || openToWork) return null;

  const handle = async () => {
    await setOpenToWork(true);
    onAfterChange?.();
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
