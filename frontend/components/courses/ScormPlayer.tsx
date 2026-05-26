/**
 * SCORM player — embeds a SCORM 1.2 / 2004 package launched by a parent
 * window and persists CMI state to /api/courses/scorm/:enrollmentId/commit.
 *
 * `scorm-again` is the actual runtime; we lazy-load it so the bundle
 * doesn't pay the cost on every Studio surface. The lib exposes a
 * SCORM/AICC/Tin Can API and a `commit` hook we wire to our backend.
 *
 * The package itself is served from R2 — `scormManifestUrl` /
 * `scormEntryUrl` come from `course_lessons.scorm_*` columns (set when
 * the author uploads a .zip). We render the entry URL in an iframe so
 * the SCORM SCO (Shareable Content Object) can call window.parent.API
 * (1.2) or window.parent.API_1484_11 (2004).
 */

import { useEffect, useRef, useState } from "react";
import { commitScormState, loadScormState, emitXapi } from "@/lib/courses/courses-api";

type ScormVersion = "1.2" | "2004_1" | "2004_2" | "2004_3" | "2004_4";
type ScormCompletionStatus = "not_attempted" | "incomplete" | "completed" | "passed" | "failed";

const SCORM_COMPLETION_STATUSES: readonly ScormCompletionStatus[] = [
  "not_attempted",
  "incomplete",
  "completed",
  "passed",
  "failed",
];

function narrowCompletion(raw: string | undefined): ScormCompletionStatus | undefined {
  if (raw == null) return undefined;
  return (SCORM_COMPLETION_STATUSES as readonly string[]).includes(raw)
    ? (raw as ScormCompletionStatus)
    : undefined;
}

interface ScormPlayerProps {
  enrollmentId: string;
  lessonId: string;
  scormVersion: ScormVersion;
  scormEntryUrl: string;
  courseId?: string;
  onCompleted?: () => void;
  className?: string;
  /** #1501 — themeTokens from the parent course's merged
   *  themeId-base + themeTokens-override map. Whitelisted to CSS custom
   *  properties applied to the chrome around the iframe; the SCO itself
   *  (loaded from R2) is untouched. Pass undefined for default chrome. */
  themeTokens?: Record<string, string>;
}

/** #1501 — whitelist mapping from course theme-token keys to the CSS
 *  custom properties exposed on the player chrome. Only these keys are
 *  honored, so an author's themeTokens JSON can't poke at arbitrary
 *  styles via spread. */
const CHROME_TOKEN_MAP: Record<string, string> = {
  backgroundColor: "--scorm-chrome-bg",
  textColor: "--scorm-chrome-text",
  accentColor: "--scorm-chrome-accent",
  borderColor: "--scorm-chrome-border",
};

function tokensToStyle(tokens: Record<string, string> | undefined): React.CSSProperties | undefined {
  if (!tokens) return undefined;
  const style: Record<string, string> = {};
  for (const [key, cssVar] of Object.entries(CHROME_TOKEN_MAP)) {
    const v = tokens[key];
    if (v) style[cssVar] = v;
  }
  return style as React.CSSProperties;
}

interface ScormAgainRuntime {
  loadFromJSON(cmi: Record<string, unknown>, prefix?: string): void;
  on(event: string, cb: (...args: unknown[]) => unknown): void;
  cmi: Record<string, unknown>;
  apiLogLevel: number;
  renderCommonCommitFields?: boolean;
}

export default function ScormPlayer({
  enrollmentId,
  lessonId,
  scormVersion,
  scormEntryUrl,
  courseId,
  onCompleted,
  className,
  themeTokens,
}: ScormPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let runtime: ScormAgainRuntime | null = null;
    let cancelled = false;

    async function init() {
      try {
        // Lazy-load scorm-again. Vite resolves the install once the
        // dependency lands in package.json; the dynamic import keeps it
        // out of every Studio surface's bundle.
        const mod = (await import(/* @vite-ignore */ "scorm-again")) as Record<string, unknown>;
        const Constructor = (
          scormVersion === "1.2"
            ? (mod.Scorm12API as new (settings: Record<string, unknown>) => ScormAgainRuntime)
            : (mod.Scorm2004API as new (settings: Record<string, unknown>) => ScormAgainRuntime)
        );

        const previousState = await loadScormState(enrollmentId, lessonId).catch(() => null);

        runtime = new Constructor({
          autocommit: true,
          autocommitSeconds: 10,
          logLevel: 4,
        });

        if (previousState?.cmi) {
          try {
            runtime.loadFromJSON(previousState.cmi);
          } catch {
            // Old state we can't load — start fresh.
          }
        }

        runtime.on("Commit", () => {
          if (!runtime) return;
          const cmi = runtime.cmi ?? {};
          const completionStatus = narrowCompletion(readCompletion(cmi, scormVersion));
          const scoreRaw = readScore(cmi, scormVersion, "raw");
          const scoreMin = readScore(cmi, scormVersion, "min");
          const scoreMax = readScore(cmi, scormVersion, "max");

          // Fire-and-forget; SCORM commits are frequent (every 10s) and
          // the runtime doesn't await our promise.
          commitScormState(enrollmentId, {
            lessonId,
            scormVersion,
            cmi: cmi as Record<string, unknown>,
            completionStatus,
            scoreRaw,
            scoreMin,
            scoreMax,
            suspendData: readSuspendData(cmi, scormVersion),
          }).catch(() => undefined);

          // Mirror "completed"/"passed" as an xAPI statement so the
          // analytics dashboard sees SCORM lessons in the same stream
          // as Studio-video and external-URL lessons.
          if (completionStatus === "completed" || completionStatus === "passed") {
            emitXapi({
              enrollmentId,
              lessonId,
              courseId,
              verb: completionStatus === "passed"
                ? { id: "http://adlnet.gov/expapi/verbs/passed", display: "passed" }
                : { id: "http://adlnet.gov/expapi/verbs/completed", display: "completed" },
              object: { id: `urn:hv:lesson:${lessonId}`, objectType: "Activity" },
              result: {
                score: scoreRaw != null ? { raw: scoreRaw } : undefined,
                success: completionStatus === "passed",
                completion: true,
              },
            }).catch(() => undefined);
            onCompleted?.();
          }
        });

        // The runtime publishes APIs onto window for the iframe SCO to
        // discover via the standard SCORM hand-shake.
        if (scormVersion === "1.2") {
          (window as unknown as { API: ScormAgainRuntime }).API = runtime;
        } else {
          (window as unknown as { API_1484_11: ScormAgainRuntime }).API_1484_11 = runtime;
        }

        if (!cancelled) setLoaded(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }

    init();
    return () => {
      cancelled = true;
      if (scormVersion === "1.2") {
        delete (window as unknown as { API?: unknown }).API;
      } else {
        delete (window as unknown as { API_1484_11?: unknown }).API_1484_11;
      }
    };
  }, [enrollmentId, lessonId, scormVersion, scormEntryUrl, courseId, onCompleted]);

  const chromeStyle = tokensToStyle(themeTokens);

  if (error) {
    return (
      <div className={className} style={chromeStyle}>
        <div
          role="alert"
          className="p-4 rounded border border-red-200 bg-red-50 text-sm text-red-900"
          style={{ borderColor: "var(--scorm-chrome-border, undefined)" }}
        >
          SCORM runtime failed to load: {error}
        </div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        ...chromeStyle,
        backgroundColor: "var(--scorm-chrome-bg, undefined)",
        color: "var(--scorm-chrome-text, undefined)",
      }}
    >
      {!loaded && (
        // #1503 — polite live region so AT learners hear the load
        // transition instead of silently staring at an empty iframe.
        <div role="status" aria-live="polite" className="p-4 text-sm text-muted-foreground">
          Loading SCORM runtime…
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={scormEntryUrl}
        title="SCORM lesson content"
        aria-label="Interactive SCORM lesson — controls live inside the lesson frame"
        className="w-full h-full min-h-[600px] border-0"
        allow="autoplay; fullscreen; camera; microphone"
        style={{ borderColor: "var(--scorm-chrome-accent, undefined)" }}
      />
    </div>
  );
}

// ── helpers — bridge the two SCORM versions' CMI shapes ───────────────

function readCompletion(cmi: Record<string, unknown>, version: ScormVersion): string | undefined {
  if (version === "1.2") {
    const core = (cmi.core as Record<string, unknown> | undefined) ?? {};
    return (core.lesson_status as string | undefined) ?? undefined;
  }
  return (cmi.completion_status as string | undefined) ?? (cmi.success_status as string | undefined) ?? undefined;
}

function readScore(cmi: Record<string, unknown>, version: ScormVersion, kind: "raw" | "min" | "max"): number | undefined {
  if (version === "1.2") {
    const score = ((cmi.core as Record<string, unknown> | undefined)?.score as Record<string, unknown> | undefined) ?? {};
    const v = score[kind];
    return typeof v === "number" ? v : v != null ? Number(v) : undefined;
  }
  const score = (cmi.score as Record<string, unknown> | undefined) ?? {};
  const v = score[kind];
  return typeof v === "number" ? v : v != null ? Number(v) : undefined;
}

function readSuspendData(cmi: Record<string, unknown>, version: ScormVersion): string | undefined {
  if (version === "1.2") return (cmi.suspend_data as string | undefined) ?? undefined;
  return (cmi.suspend_data as string | undefined) ?? undefined;
}
