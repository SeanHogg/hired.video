/**
 * "Practise these questions" anywhere questions exist (Interview Questions,
 * an interview assignment): opens the Interview Coach in a slide-out on the
 * same page, starting on these questions — no hand-off to another page or a
 * general AI chat.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { PracticeHandoff } from "@/lib/services/interview-assignments-service";
import InterviewCoach from "./InterviewCoach";
import { practiceStartFromHandoff } from "./practice-start";

interface PracticeInterviewButtonProps {
  handoff: PracticeHandoff;
  label: string;
}

export default function PracticeInterviewButton({ handoff, label }: PracticeInterviewButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Fixed when opened, so editing the list doesn't restart a session mid-way.
  const [startKey, setStartKey] = useState(0);
  const start = useMemo(() => practiceStartFromHandoff(handoff), [handoff]);

  if (handoff.questions.length === 0) return null;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1"
        aria-haspopup="dialog"
        onClick={() => {
          setStartKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
        {label}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <SheetHeader className="flex-none border-b border-border px-5 py-4 pr-12 text-left">
            <SheetTitle>{t("headings.interview.practiceTitle")}</SheetTitle>
            <SheetDescription>{t("messages.interview.practiceSheetSubtitle")}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
            {open && <InterviewCoach key={startKey} start={start} />}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
