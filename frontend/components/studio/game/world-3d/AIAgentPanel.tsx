/**
 * AIAgentPanel — Phase 5 right-rail chat with the game-builder agent
 * (gap #1638). The agent calls server-side mutation tools that update
 * the project's GameState directly; this panel shows the chat history
 * + the per-tool-call "applied" log + a prompt textarea.
 *
 * Self-gates: when there's no project id (brand-new draft not yet
 * saved), the panel asks the author to save first.
 */

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GameState } from "@shared/game-state";
import {
  GAME_AGENT_TOOL_LABELS,
  type GameAgentToolName,
} from "@shared/game-agent-tools";
import { gamesApiJson } from "@/lib/services/games-api";

interface AIAgentPanelProps {
  /** Persisted project id. Null when the draft hasn't been saved yet —
   *  the panel still renders, but the prompt is disabled with a hint. */
  projectId: string | null;
  /** Called after a successful turn with the new GameState the agent
   *  produced. Host writes back via the same setGameState seam. */
  onApplyState: (next: GameState) => void;
}

interface TurnRecord {
  user: string;
  assistant: string;
  toolCalls: Array<{
    name: GameAgentToolName;
    applied: boolean;
    error?: string;
  }>;
}

export default function AIAgentPanel({ projectId, onApplyState }: AIAgentPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Hydrate conversation on mount + when projectId becomes available.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await gamesApiJson<{ messages: PersistedMessage[] }>(
          `/api/studio/game-agent/${projectId}/conversation`,
        );
        if (cancelled) return;
        setTurns(restoreTurns(data?.messages ?? []));
      } catch {
        // Hydration is best-effort. A fresh start works fine.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  const submit = async () => {
    if (!projectId || !prompt.trim() || pending) return;
    setPending(true);
    setError(null);
    const userMsg = prompt.trim();
    setPrompt("");
    try {
      const data = await gamesApiJson<{
        newGameState?: GameState;
        toolCalls: { name: GameAgentToolName; applied: boolean; error?: string }[];
        assistantMessage?: string;
      }>(`/api/studio/game-agent/${projectId}/turn`, {
        method: "POST",
        body: { message: userMsg },
      });
      setTurns((t) => [
        ...t,
        {
          user: userMsg,
          assistant: data.assistantMessage ?? "",
          toolCalls: data.toolCalls.map((tc) => ({
            name: tc.name,
            applied: tc.applied,
            error: tc.error,
          })),
        },
      ]);
      if (data.newGameState) onApplyState(data.newGameState);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network failure");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto pr-1">
        {turns.length === 0 && (
          <div className="rounded border border-dashed border-border bg-muted/30 p-3 text-muted-foreground">
            <Sparkles className="mb-1 inline h-3 w-3 text-teal-500" />{" "}
            Tell the AI what to build. Example: <em>"Make a tower with five platforms and a goal on top, and add a collect-3-coins challenge."</em>
          </div>
        )}
        {turns.map((t, i) => (
          <TurnBlock key={i} turn={t} />
        ))}
        {pending && (
          <div className="rounded bg-teal-50/40 px-2 py-1 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
            Agent is building…
          </div>
        )}
        {error && (
          <div className="rounded border border-rose-500/40 bg-rose-50/40 px-2 py-1 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        )}
      </div>

      {!projectId ? (
        <p className="text-muted-foreground">Save the project first — the agent needs a persisted world to mutate.</p>
      ) : (
        <div className="flex items-center gap-1">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Describe what to build…  (⌘+Enter to send)"
            rows={2}
            className="min-h-[44px] flex-1 resize-none rounded border border-border bg-background p-1.5 text-[11px]"
            disabled={pending}
          />
          <button
            type="button"
            onClick={submit}
            disabled={pending || !prompt.trim()}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded text-white",
              pending || !prompt.trim()
                ? "bg-muted-foreground/30"
                : "bg-teal-600 hover:bg-teal-500",
            )}
            aria-label="Send"
            title="Send (⌘+Enter)"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function TurnBlock({ turn }: { turn: TurnRecord }) {
  return (
    <div className="space-y-1">
      <div className="rounded bg-teal-600 px-2 py-1 text-white">{turn.user}</div>
      {turn.assistant && (
        <div className="rounded bg-muted px-2 py-1">{turn.assistant}</div>
      )}
      {turn.toolCalls.length > 0 && (
        <div className="space-y-0.5">
          {turn.toolCalls.map((tc, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 text-[10px]",
                tc.applied
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-rose-500/15 text-rose-700 dark:text-rose-300",
              )}
            >
              <span>{tc.applied ? "✓" : "✗"}</span>
              <span className="font-medium">{GAME_AGENT_TOOL_LABELS[tc.name]}</span>
              {tc.error && <span className="ml-1 truncate">{tc.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface PersistedMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: Array<{ id: string; name: GameAgentToolName; arguments: string }>;
  toolCallId?: string;
}

/** Reconstruct the per-turn UI shape from the flat persisted message
 *  log. Each `(user, assistant, tool*)` cluster collapses into one
 *  TurnRecord — the persisted log keeps individual tool-result rows
 *  for replay, but the UI shows them grouped under their owning turn. */
function restoreTurns(messages: PersistedMessage[]): TurnRecord[] {
  const turns: TurnRecord[] = [];
  let pending: TurnRecord | null = null;
  for (const m of messages) {
    if (m.role === "user") {
      if (pending) turns.push(pending);
      pending = { user: m.content, assistant: "", toolCalls: [] };
    } else if (m.role === "assistant" && pending) {
      pending.assistant = m.content;
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          pending.toolCalls.push({ name: tc.name, applied: true });
        }
      }
    } else if (m.role === "tool" && pending) {
      try {
        const parsed = JSON.parse(m.content);
        const existing = pending.toolCalls[pending.toolCalls.length - 1];
        if (existing) {
          existing.applied = Boolean(parsed.applied);
          if (parsed.error) existing.error = String(parsed.error);
        }
      } catch {
        // Malformed tool record — leave the turn intact.
      }
    }
  }
  if (pending) turns.push(pending);
  return turns;
}
