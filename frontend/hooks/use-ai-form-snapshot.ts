import { useEffect } from "react";
import { useAI } from "@/lib/ai-context";

/**
 * Push an authoring page's live form values into the AI context so the
 * chat panel's system prompt can see the in-progress draft (gap #1621).
 *
 * Closes the long-standing gap where `BaseAIContext.formSnapshot` was
 * defined but no page ever populated it — the AI could not answer "is my
 * draft missing anything?" because it never received the form state.
 *
 * Usage (in an authoring page, e.g. JobCreatePage / ResumeEditPage):
 *
 *   const values = form.watch();           // RHF live values
 *   useAIFormSnapshot(values);             // streams them to the panel
 *
 * The snapshot is held in a dedicated provider slot (not `pageContext`),
 * so the route-change effect that rebuilds `pageContext` never clobbers
 * it. It is cleared automatically when the page unmounts.
 *
 * Pass `undefined` (or skip calling) to register nothing.
 */
export function useAIFormSnapshot(
  snapshot: Record<string, unknown> | undefined,
): void {
  const { setFormSnapshot } = useAI();

  // Serialize for the effect dependency so we only push when values
  // actually change, not on every render (RHF returns a new object each
  // render). JSON is sufficient for the shallow, JSON-able form values.
  const serialized = snapshot ? JSON.stringify(snapshot) : undefined;

  useEffect(() => {
    setFormSnapshot(snapshot);
    return () => setFormSnapshot(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, setFormSnapshot]);
}
