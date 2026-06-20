/**
 * AnonGateContext — lets any descendant of the Studio editor self-gate a
 * server-touching action behind authentication, without prop-drilling the gate
 * through every panel (#2214). The editor provides the real gate (from
 * [components/auth/useAuthGate]); shared hooks/components (AI generation, media
 * upload, save-to-library) consume it and gate their own server call.
 *
 * The default value is a NO-OP that always allows the action — so the same
 * shared hooks used OUTSIDE an anon-gated editor (authenticated surfaces, other
 * pages) behave exactly as before. Per the DRY rule the consumer never computes
 * "am I allowed" itself; it asks the gate, which returns true for authenticated
 * users and for any context with no provider.
 */
import { createContext, useContext } from "react";

export interface AnonGateRequest {
  /** Machine reason (save / publish / export / ai / upload …) — used for the
   *  conversion-funnel event. */
  reason: string;
  /** Human headline shown in the auth panel. */
  displayReason: string;
  /** Re-run after the visitor authenticates in place. Pass the same action so
   *  it completes once the gate is satisfied. */
  onAuthed: () => void;
}

export interface AnonGateValue {
  /** True when the current visitor is unauthenticated (so a consumer can also
   *  disable / annotate an affordance proactively). */
  isAnon: boolean;
  /** Returns true when the action may proceed inline (authenticated, or no
   *  provider); otherwise opens the in-place auth panel and returns false. */
  requireAuth: (req: AnonGateRequest) => boolean;
}

const NOOP_GATE: AnonGateValue = {
  isAnon: false,
  requireAuth: () => true,
};

export const AnonGateContext = createContext<AnonGateValue>(NOOP_GATE);

export function useAnonGate(): AnonGateValue {
  return useContext(AnonGateContext);
}
