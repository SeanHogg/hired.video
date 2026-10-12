/**
 * useBulletConsolidate — "AI consolidate" for a merged entry's bullets: the
 * server dedupes near-duplicates and tightens wording without inventing
 * facts (POST /api/resumes/ai/consolidate-bullets). The rewrite is held as
 * a PROPOSAL until the person accepts it; nothing changes before that.
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { resumeService } from "@/lib/services/resume-service";
import type { BulletFieldType } from "@/types/resume";

export function useBulletConsolidate(sectionType: string, entryLabel: string) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<string[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const fieldType: BulletFieldType = sectionType === "education" ? "courses" : "highlights";

  const run = useCallback(
    async (bullets: string[]) => {
      if (bullets.length < 2) {
        toast({ title: t("merge.ai.needTwoTitle"), description: t("merge.ai.needTwoBody") });
        return;
      }
      setBusy(true);
      try {
        const result = await resumeService.consolidateBullets({ bullets, fieldType, sectionType, entryLabel });
        if (result.unchanged) {
          toast({ title: t("merge.ai.unavailable"), description: result.reason, variant: "destructive" });
          return;
        }
        setProposal(result.rewritten);
        setNotes(result.notes ?? []);
      } catch (err) {
        toast({
          title: t("merge.ai.failed"),
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      } finally {
        setBusy(false);
      }
    },
    [fieldType, sectionType, entryLabel, toast, t],
  );

  const dismiss = useCallback(() => {
    setProposal(null);
    setNotes([]);
  }, []);

  return { busy, proposal, notes, run, dismiss };
}
