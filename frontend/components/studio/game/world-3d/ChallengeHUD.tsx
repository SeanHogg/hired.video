/**
 * ChallengeHUD — play-mode overlay listing each active challenge with
 * a live progress line. Self-gates: returns null when there are no
 * challenges to render (no prop-drilled `canShow` boolean — the host
 * just mounts the HUD; this component decides whether it's relevant).
 */

import { Trophy, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { World3DChallenge } from "@shared/game-state";
import {
  formatProgress,
  type ChallengeProgress,
  type ChallengeRuntimeState,
} from "@/lib/studio/game/challenge-runtime";

interface ChallengeHUDProps {
  challenges: World3DChallenge[];
  runtime: ChallengeRuntimeState;
}

export default function ChallengeHUD({ challenges, runtime }: ChallengeHUDProps) {
  if (challenges.length === 0) return null;
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 flex max-w-xs flex-col gap-1">
      {challenges.map((c) => {
        const progress = runtime.challenges[c.id];
        if (!progress) return null;
        return <Row key={c.id} label={c.label} progress={progress} />;
      })}
    </div>
  );
}

function Row({ label, progress }: { label: string; progress: ChallengeProgress }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md bg-black/70 px-2 py-1 text-xs text-white shadow-md backdrop-blur",
        progress.completed && "bg-emerald-600/85",
      )}
    >
      {progress.completed ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-200" />
      ) : (
        <Trophy className="h-3.5 w-3.5 text-fuchsia-300" />
      )}
      <span className="flex-1 truncate font-medium">{label}</span>
      <span className="font-mono text-[11px] tabular-nums">{formatProgress(progress)}</span>
    </div>
  );
}
