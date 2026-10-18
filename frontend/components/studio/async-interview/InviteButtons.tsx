import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resendInterviewInvite } from "@/lib/services/interview-assignments-service";
import { isInviteClosed } from "./helpers";
import { useCopyFeedback } from "./useCopyFeedback";

/** Copy / copied icon pair shared by the invite copy buttons. */
export function CopyStateIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <Check className="h-4 w-4 text-green-600" />
  ) : (
    <Copy className="h-4 w-4" />
  );
}

export function CopyInviteButton({ url }: { url: string }) {
  const { t } = useTranslation();
  const { copied, copy } = useCopyFeedback(url);
  return (
    <Button variant="ghost" size="icon" onClick={copy} title={t("studio.asyncInterview.copyInviteLink")}>
      <CopyStateIcon copied={copied} />
    </Button>
  );
}

export function ResendInviteButton({
  interviewId,
  status,
  onResent,
}: {
  interviewId: string;
  status: string;
  onResent: () => void;
}) {
  const { t } = useTranslation();
  const [resending, setResending] = useState(false);
  const disabled = isInviteClosed(status);
  async function handle() {
    setResending(true);
    try {
      await resendInterviewInvite(interviewId);
      onResent();
    } catch {
      // toast is owned by the parent's fetchInterviews → error path
    } finally {
      setResending(false);
    }
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handle}
      disabled={disabled || resending}
      title={t("studio.asyncInterview.resendInvite")}
    >
      {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
    </Button>
  );
}
