/**
 * SubjectSeedBanner — banner shown above the V2 canvas when a user
 * arrives via an entity-card "Create Video" deep-link
 * (`/studio?subject=resume:abc&new=1`) on a fresh empty draft.
 *
 * Confirms the entity linkage (chip is invisible until first save) and
 * offers to AI-pre-fill the canvas from the subject's content so the
 * user doesn't land in a blank-canvas dead-end (#650). Self-gates and
 * returns null when:
 *   - There is no urlSubject.
 *   - The canvas is no longer empty (the seed already ran, or the user
 *     started building manually).
 *
 * Generation routes through `studioService.generateStoryboard` and
 * yields a VideoScript; the consumer hydrates the canvas via
 * `useTimelineCanvas().loadScript` (script → canvas, fresh history).
 */
import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  studioService,
  type GenerateStoryboardParams,
} from "@/lib/services/studio-service";
import { useSubjectSeed } from "@/lib/studio/use-subject-seed";
import type { StudioSubject } from "@shared/studio-subject";
import type { VideoScript } from "@/types/video-script";

interface Props {
  subject: StudioSubject | null;
  /** True when the canvas has no widgets across any scene; banner
   *  self-hides as soon as content lands. */
  canvasEmpty: boolean;
  /** Fires once after the user clicks Generate and the API returns a
   *  VideoScript. Consumer hydrates the canvas. */
  onSeed: (script: VideoScript) => void;
}

export default function SubjectSeedBanner({
  subject,
  canvasEmpty,
  onSeed,
}: Props) {
  const { toast } = useToast();
  const { displayName, summary, loading, canSeed } = useSubjectSeed(subject);
  const [generating, setGenerating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!subject || !canvasEmpty || dismissed) return null;
  if (loading) return null;

  async function handleGenerate() {
    if (!subject || !summary) return;
    setGenerating(true);
    try {
      const params: GenerateStoryboardParams = {
        resumeText: summary,
        ...(subject.kind === "resume" ? { resumeId: subject.id } : {}),
        purpose:
          subject.kind === "resume"
            ? "resume"
            : subject.kind === "job"
              ? "job_ad"
              : subject.kind === "company"
                ? "company_promo"
                : "resume",
      };
      const res = await studioService.generateStoryboard(params);
      if (!res.data) throw new Error("No script returned");
      onSeed(res.data);
      toast({ title: "Canvas pre-filled", description: `Generated from ${displayName}` });
    } catch (err) {
      toast({
        title: "Couldn't pre-fill canvas",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-border bg-brand-primary/5 px-4 py-2 text-sm">
      <Sparkles className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">
          Making a video for {displayName}
        </span>
        <span className="ml-2 text-muted-foreground">
          — links on save.
          {canSeed ? " Want a head start?" : ""}
        </span>
      </div>
      {canSeed && (
        <Button
          size="sm"
          variant="default"
          onClick={() => void handleGenerate()}
          disabled={generating || !summary}
          className="gap-1"
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {generating ? "Generating…" : "Pre-fill with AI"}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="h-7 w-7 p-0"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
