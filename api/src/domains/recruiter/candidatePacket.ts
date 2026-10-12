/**
 * Candidate Packet anonymization (#243).
 *
 * Pure, side-effect-free identity transform applied at the packet render
 * boundary. When a recruiter exports a multi-candidate packet for a hiring
 * manager with "Anonymize" on, the candidate's name → initials and their
 * email + photo are dropped, so the HM evaluates on substance (skills,
 * scores, notes) without name/photo bias. Off, the real identity is shown.
 *
 * Kept pure so it can be unit-tested without a DB and reused by any future
 * surface that needs the same blind-the-candidate transform.
 */

export interface PacketCandidateIdentity {
  /** Full candidate name (snapshot from the submission). */
  name: string;
  /** Candidate email, if known. */
  email: string | null;
  /** Candidate avatar URL, if resolved. */
  avatarUrl: string | null;
}

/**
 * Initials for a name: first letter of the first and last meaningful word,
 * uppercased (e.g. "Ada Lovelace" → "AL", "cher" → "C"). Falls back to "?"
 * when no letters are present so the avatar placeholder never renders empty.
 */
export function candidateInitials(name: string): string {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w));
  if (words.length === 0) return "?";
  const first = words[0]![0]!;
  const last = words.length > 1 ? words[words.length - 1]![0]! : "";
  return (first + last).toUpperCase();
}

/**
 * Apply the anonymize toggle to one candidate's identity. When anonymizing,
 * the display name becomes the initials and email/photo are stripped; the
 * non-identity payload (scores, notes, stage) is rendered by the caller
 * either way.
 */
export function anonymizeIdentity(
  identity: PacketCandidateIdentity,
  anonymize: boolean,
): PacketCandidateIdentity {
  if (!anonymize) return identity;
  return {
    name: candidateInitials(identity.name),
    email: null,
    avatarUrl: null,
  };
}
