import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { creatorService, type CreatorProfile } from "@/lib/services/creator-service";
import { useCreatorMine } from "@/hooks/queries/use-creator";
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
  const { t } = useTranslation();
  const { toast } = useToast();
  const mine = useCreatorMine();
  const profile = mine.isError ? null : (mine.data ?? null);
  const loading = mine.isPending && mine.fetchStatus !== "idle";
  const [cancelling, setCancelling] = useState(false);
  const [left, setLeft] = useState(false);

  const cancel = async () => {
    if (!(await confirmDialog({ title: t("dialogs.creator.leaveProgramTitle"), description: t("dialogs.creator.leaveProgramBody"), confirmText: t("dialogs.creator.leaveProgramConfirm"), destructive: true }))) return;
    setCancelling(true);
    try {
      await creatorService.cancel();
      setLeft(true);
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

  if (loading || !profile || left) return null;

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
