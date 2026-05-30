import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { creatorService, type CreatorProfile } from "@/lib/services/creator-service";
import { confirmDialog } from "@/lib/dialogs";

interface Props {
  onProfileChange?: (next: CreatorProfile | null) => void;
}

/**
 * Self-contained "leave the Creator Program" danger zone — fetches its own
 * enrollment status and self-gates: returns null for non-creators (there's
 * nothing to leave). Mounted from /services Creator workspace and
 * /settings → Content Creator → Leave program.
 */
export default function LeaveCreatorProgramCard({ onProfileChange }: Props = {}) {
  const { toast } = useToast();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    creatorService.getMine()
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch(() => { if (!cancelled) setProfile(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const cancel = async () => {
    if (!(await confirmDialog({ title: "Leave program", description: "Leave the Creator Program entirely? Your enrollment will end. You can re-enroll later — this starts a new enrollment row.", confirmText: "Leave", destructive: true }))) return;
    setCancelling(true);
    try {
      await creatorService.cancel();
      setProfile(null);
      onProfileChange?.(null);
      toast({ title: "Left the program", description: "Your creator enrollment has ended." });
    } catch (e: unknown) {
      toast({
        title: "Cancel failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  if (loading || !profile) return null;

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold">Leave the Creator Program</h2>
            <p className="text-sm text-muted-foreground">
              Ends your enrollment entirely. Active per-program flags are cleared and the enrollment is closed (term date set). You can re-enroll any time — this starts a new enrollment row, preserving your earnings history.
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="destructive" size="sm" onClick={cancel} disabled={cancelling}>
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Leave program
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
