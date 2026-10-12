/**
 * Full-screen celebration for badge unlocks, streak milestones, and
 * redemptions — the "more than a toast" moment (product ask 2026-06-21).
 *
 * Lifecycle per celebration: a confetti burst + the badge artwork pops in
 * centre-screen ("enter"), holds, then the artwork shrinks and flies into
 * the badge gallery ("fly", targeting the rect the gallery registered via
 * [registerCelebrationTarget](../../lib/points/celebration.ts)). When it
 * lands the badge is marked glowing so the gallery throbs it.
 *
 * Mount ONCE globally (App.tsx, next to BadgeUnlockToaster). Listens on
 * the celebration bus, queues fires, and plays them one at a time so a
 * burst of unlocks doesn't overlap. Pointer-events stay off so it never
 * blocks the UI underneath.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { BadgeIcon } from "@/components/badges/BadgeIcon";
import {
  getCelebrationTargetRect,
  markBadgeGlowing,
  onCelebrate,
  type CelebrationPayload,
} from "@/lib/points/celebration";
import { cn } from "@/lib/utils";

const ENTER_HOLD_MS = 1700;
const FLY_MS = 750;
// Theme tokens (primary blue, success green, warm amber) so the burst follows
// the brand palette in both themes.
const CONFETTI_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--brand-green))",
  "hsl(var(--brand-orange))",
  "hsl(var(--brand-blue))",
];

type Phase = "enter" | "fly";

export function CelebrationOverlay() {
  const { t } = useTranslation();
  const [queue, setQueue] = useState<CelebrationPayload[]>([]);
  const [phase, setPhase] = useState<Phase>("enter");
  const [flyStyle, setFlyStyle] = useState<React.CSSProperties | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to the bus — append every fire to the queue.
  useEffect(() => onCelebrate((c) => setQueue((q) => [...q, c])), []);

  const current = queue[0] ?? null;

  // Drive the phase machine for the head of the queue.
  useEffect(() => {
    if (!current) return;
    setPhase("enter");
    setFlyStyle(null);

    const flyTimer = window.setTimeout(() => {
      // Compute the shrink-into-gallery transform from the card's current
      // centre to the registered gallery rect (falls back to top-right).
      const target = getCelebrationTargetRect();
      const card = cardRef.current?.getBoundingClientRect();
      if (card) {
        const fromX = card.left + card.width / 2;
        const fromY = card.top + card.height / 2;
        const toX = target ? target.left + target.width / 2 : window.innerWidth - 60;
        const toY = target ? target.top + Math.min(target.height / 2, 80) : 90;
        setFlyStyle({
          transform: `translate(${toX - fromX}px, ${toY - fromY}px) scale(0.12)`,
          opacity: 0,
        });
      } else {
        setFlyStyle({ transform: "scale(0.12)", opacity: 0 });
      }
      setPhase("fly");
      if (current.badgeId) markBadgeGlowing(current.badgeId);
    }, ENTER_HOLD_MS);

    const doneTimer = window.setTimeout(() => {
      setQueue((q) => q.slice(1));
    }, ENTER_HOLD_MS + FLY_MS);

    return () => {
      window.clearTimeout(flyTimer);
      window.clearTimeout(doneTimer);
    };
  }, [current]);

  const confetti = useMemo(() => (current ? makeConfetti() : []), [current]);

  if (!current) return null;

  const multiplier = current.kind === "streak" && (current.earnCount ?? 0) >= 1 ? current.earnCount : null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center pointer-events-none overflow-hidden">
      {/* Confetti only during the enter phase. */}
      {phase === "enter" &&
        confetti.map((p, i) => (
          <span
            key={i}
            className="absolute top-1/2 left-1/2 h-2 w-2 rounded-sm animate-confetti-fall"
            style={p}
          />
        ))}

      <div
        ref={cardRef}
        className={cn(
          "flex flex-col items-center gap-3 rounded-2xl bg-background/95 backdrop-blur border border-border shadow-2xl px-8 py-6",
          phase === "enter" && "animate-celebrate-in",
        )}
        style={
          phase === "fly"
            ? { transition: `transform ${FLY_MS}ms cubic-bezier(.4,0,.2,1), opacity ${FLY_MS}ms ease-in`, ...flyStyle }
            : undefined
        }
      >
        <div className="relative">
          <BadgeIcon iconKey={current.iconKey} tier={current.tier ?? "bronze"} earned size="lg" />
          {multiplier != null && (
            <span className="absolute -top-2 -right-2 rounded-full bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 shadow tabular-nums">
              ×{multiplier}
            </span>
          )}
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            <Sparkles className="h-3.5 w-3.5" />
            {current.kind === "streak"
              ? t("labels.rewards.celebStreak")
              : current.kind === "reward"
                ? t("labels.rewards.celebReward")
                : t("labels.rewards.celebBadge")}
          </div>
          <div className="text-lg font-bold mt-1">{current.title}</div>
          {current.description && (
            <div className="text-sm text-muted-foreground mt-0.5 max-w-xs">{current.description}</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Random confetti spray — runs in the browser so Math.random is fine. */
function makeConfetti(): React.CSSProperties[] {
  return Array.from({ length: 28 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 120 + Math.random() * 220;
    return {
      backgroundColor: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      animationDelay: `${Math.random() * 0.15}s`,
      ["--confetti-x"]: `${Math.cos(angle) * dist}px`,
      ["--confetti-y"]: `${Math.sin(angle) * dist}px`,
      ["--confetti-r"]: `${Math.random() * 720 - 360}deg`,
    } as React.CSSProperties;
  });
}
