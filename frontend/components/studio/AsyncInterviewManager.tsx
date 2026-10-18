"use client";

import { CandidateView } from "@/components/studio/async-interview/CandidateView";
import { RecruiterView } from "@/components/studio/async-interview/RecruiterView";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AsyncInterviewManagerProps {
  isRecruiter?: boolean;
  inviteToken?: string;
  onComplete?: () => void;
}

// ─── Main Component ─────────────────────────────────────────────────────────
// Container only — recruiter (create / list / responses) and candidate
// (record + submit) flows live under ./async-interview/.

export default function AsyncInterviewManager({
  isRecruiter = true,
  inviteToken,
  onComplete,
}: AsyncInterviewManagerProps) {
  if (!isRecruiter && inviteToken) {
    return (
      <CandidateView inviteToken={inviteToken} onComplete={onComplete} />
    );
  }

  return <RecruiterView />;
}
