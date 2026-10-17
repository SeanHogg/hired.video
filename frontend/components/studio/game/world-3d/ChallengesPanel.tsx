/**
 * ChallengesPanel — edit-mode CRUD for `World3DState.challenges[]`
 * (gap #1635, Phase 2 of the 3D world build). Lists existing
 * challenges, lets the author add new ones per kind, edit label +
 * params, delete.
 *
 * Every mutation routes through the shared world-3d-edit helpers so
 * the editor + the Phase-5 AI agent's `add_challenge` / `update_challenge`
 * / `delete_challenge` tool-calls land on the same seam. No fork.
 */

import { Plus, Trash2 } from "lucide-react";
import type {
  GameState,
  World3DChallenge,
  World3DChallengeKind,
} from "@shared/game-state";
import {
  addChallenge,
  deleteChallenge,
  getWorld,
  updateChallenge,
} from "@/lib/studio/game/world-3d-edit";
import { numberOr, stringOr } from "@/lib/numeric";

interface ChallengesPanelProps {
  gameState: GameState;
  onChange: (next: GameState) => void;
}

const KIND_OPTIONS: { id: World3DChallengeKind; label: string; defaultParams: Record<string, unknown> }[] = [
  { id: "collect", label: "Collect N", defaultParams: { count: 5, tag: "" } },
  { id: "reach",   label: "Reach goal", defaultParams: { tag: "" } },
  { id: "score",   label: "Score X", defaultParams: { target: 100 } },
  { id: "timer",   label: "Beat the clock", defaultParams: { budgetMs: 60_000 } },
];

export default function ChallengesPanel({
  gameState,
  onChange,
}: ChallengesPanelProps) {
  const world = getWorld(gameState);
  if (!world) {
    return <div className="text-xs text-muted-foreground">3D world not initialized.</div>;
  }

  const handleAdd = (kind: World3DChallengeKind) => {
    const preset = KIND_OPTIONS.find((k) => k.id === kind)!;
    const label =
      kind === "collect" ? "Collect coins" :
      kind === "reach"   ? "Reach the goal" :
      kind === "score"   ? "Score 100" :
      "Beat the clock";
    const result = addChallenge(gameState, { kind, label, params: { ...preset.defaultParams } });
    onChange(result.state);
  };

  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="mb-1 font-medium">Add a challenge</div>
        <div className="grid grid-cols-2 gap-1">
          {KIND_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleAdd(id)}
              className="flex items-center gap-1 rounded border border-border bg-muted/50 px-2 py-1 text-left hover:bg-muted"
            >
              <Plus className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 font-medium">{world.challenges.length} challenge{world.challenges.length === 1 ? "" : "s"}</div>
        {world.challenges.length === 0 ? (
          <p className="text-muted-foreground">No challenges yet — players just explore.</p>
        ) : (
          <div className="space-y-2">
            {world.challenges.map((c) => (
              <ChallengeRow
                key={c.id}
                challenge={c}
                onChange={(p) => onChange(updateChallenge(gameState, c.id, p))}
                onDelete={() => onChange(deleteChallenge(gameState, c.id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ChallengeRowProps {
  challenge: World3DChallenge;
  onChange: (patch: Partial<Omit<World3DChallenge, "id">>) => void;
  onDelete: () => void;
}

function ChallengeRow({ challenge, onChange, onDelete }: ChallengeRowProps) {
  const params = challenge.params;
  const patchParams = (k: string, v: unknown) =>
    onChange({ params: { ...params, [k]: v } });

  return (
    <div className="rounded border border-border bg-muted/30 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <input
          type="text"
          value={challenge.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="flex-1 rounded border border-border bg-background px-1 py-0.5 text-[11px] font-medium"
        />
        <span className="rounded bg-teal-600/20 px-1.5 py-0.5 text-[10px] uppercase text-teal-700 dark:text-teal-300">
          {challenge.kind}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-0.5 text-rose-500 hover:bg-rose-500/10"
          aria-label="Delete challenge"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <KindParams kind={challenge.kind} params={params} onPatch={patchParams} />
    </div>
  );
}

interface KindParamsProps {
  kind: World3DChallengeKind;
  params: Record<string, unknown>;
  onPatch: (key: string, value: unknown) => void;
}

function KindParams({ kind, params, onPatch }: KindParamsProps) {
  switch (kind) {
    case "collect":
      return (
        <div className="grid grid-cols-2 gap-1">
          <NumberInput label="Count" value={numberOr(params.count, 5)} onChange={(v) => onPatch("count", v)} min={1} />
          <TextInput label="Tag" value={stringOr(params.tag, "")} onChange={(v) => onPatch("tag", v)} placeholder="coin" />
        </div>
      );
    case "reach":
      return <TextInput label="Tag" value={stringOr(params.tag, "")} onChange={(v) => onPatch("tag", v)} placeholder="level-goal" />;
    case "score":
      return <NumberInput label="Target" value={numberOr(params.target, 100)} onChange={(v) => onPatch("target", v)} min={1} />;
    case "timer":
      return (
        <NumberInput
          label="Seconds"
          value={Math.round(numberOr(params.budgetMs, 60_000) / 1000)}
          onChange={(v) => onPatch("budgetMs", v * 1000)}
          min={5}
        />
      );
  }
}

function NumberInput({ label, value, onChange, min }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <label className="flex items-center gap-1">
      <span className="w-12 text-[10px] text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => {
          const n = Number.parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-full rounded border border-border bg-background px-1 py-0.5 text-[11px]"
      />
    </label>
  );
}

function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex items-center gap-1">
      <span className="w-12 text-[10px] text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border bg-background px-1 py-0.5 text-[11px]"
      />
    </label>
  );
}

