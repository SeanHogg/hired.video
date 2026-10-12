import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import InterviewCoach from "@/components/interview-practice/InterviewCoach";
import { InterviewPracticeLanding } from "@/components/interview-practice/InterviewPracticeLanding";

// /interview — AI interview practice. Signed-out visitors get the marketing
// landing; signed-in users run the coach. The coach itself is shell-free
// (components/interview-practice/InterviewCoach) so the same practice runs in
// the kit's slide-out and beside generated questions — this page is chrome.

export default function InterviewPractice() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  useSEO(location.pathname, {
    title: t("messages.interview.seoTitle"),
    description: t("messages.interview.seoDescription"),
  });
  useBreadcrumbs([{ name: t("studio.interviewPractice.heading"), url: "/interview" }]);

  return (
    <AppShell bgClassName="bg-background">
      {isAuthenticated ? (
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
          <InterviewCoach />
        </div>
      ) : (
        <InterviewPracticeLanding />
      )}
    </AppShell>
  );
}
