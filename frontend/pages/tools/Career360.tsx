// Career 360 — target-driven gap-and-plan view for job seekers.
//
// This page is a thin shell: it owns the tool chrome (SEO, breadcrumbs,
// header via ToolShell) and delegates the entire surface to the reusable
// <Career360Body />, which is also embedded in the resume-view slide-out
// (components/career360/Career360ResumeCard.tsx). Keeping the body in one
// component means the /tools page and the resume-view panel can never
// drift.

import { useTranslation } from "react-i18next";
import { Compass } from "lucide-react";
import { ToolShell } from "@/components/tools/ToolShell";
import { Career360Body } from "@/components/career360/Career360Body";

export default function Career360() {
  const { t } = useTranslation();
  return (
    <ToolShell
      toolId="career-360"
      header={{
        icon: <Compass className="h-6 w-6 text-brand-purple" />,
        iconBgClassName: "bg-brand-purple/10",
        title: t("tools.career360.title"),
        description: t("tools.career360.subtitle"),
        tier: "free",
      }}
    >
      <Career360Body />
    </ToolShell>
  );
}
