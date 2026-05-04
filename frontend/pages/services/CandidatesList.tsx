// CandidatesList — recruiter-facing list of candidate_resumes scoped to
// the agency's company. Companion detail page at /services/candidates/:id
// handles variants + share creation.
//
// MVP import flow: paste a JSON Resume. File upload + PDF extraction
// reuses the existing tool pipeline and lands in a follow-up (same
// surface, bigger drawer).

import { UserCheck } from "lucide-react";
import ServicesNav from "@/components/services/ServicesNav";
import CandidatesPanel from "@/components/recruit/CandidatesPanel";
import { AppShell } from "@/components/AppShell";

export default function CandidatesList() {
  return (
    <AppShell bgClassName="bg-background">
<div className="pt-16">
          <div className="max-w-6xl mx-auto p-6">
            <ServicesNav hasCompanyAccess />

            <div className="mb-6">
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                <UserCheck className="w-7 h-7 text-primary" />
                Candidates
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Private to your company. Source, annotate, and share with hiring clients
                through redacted + branded links.
              </p>
            </div>

            <CandidatesPanel />
          </div>
</div>
</AppShell>
  );
}
