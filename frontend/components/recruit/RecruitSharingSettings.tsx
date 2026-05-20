// RecruitSharingSettings — the consolidated "Sharing & Branding" panel for
// recruiters. Loads the recruit scope once and renders both reusable
// sub-sections: brand kits applied to share links + per-company redaction
// profiles that strip PII before render.
//
// Self-gates: returns a friendly empty state when the caller doesn't have
// any recruiting companies (the panel still mounts so consumers don't
// have to compute visibility themselves).

import { Building2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentCompanyScope } from "@/hooks/use-current-company-scope";
import BrandKitsSection from "@/components/recruit/BrandKitsSection";
import RedactionProfilesSection from "@/components/recruit/RedactionProfilesSection";

export default function RecruitSharingSettings() {
  const { scope, companyId, setCompanyId, loading, refresh } = useCurrentCompanyScope();

  if (loading && !scope) {
    return (
      <div className="rounded-lg border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
        Loading sharing settings…
      </div>
    );
  }

  if (!scope || scope.companies.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
        Recruiter sharing settings are available once you've joined a company.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Sharing &amp; Branding</h2>
          <p className="text-sm text-muted-foreground">
            Brand kits and redaction profiles used when you share candidates or decks
            with hiring clients.
          </p>
        </div>
        {scope.companies.length > 1 && (
          <Select value={companyId ?? ""} onValueChange={(v) => setCompanyId(v)}>
            <SelectTrigger className="w-[220px]">
              <Building2 className="w-4 h-4 mr-1" />
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              {scope.companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <BrandKitsSection scope={scope} onChange={refresh} />
      <RedactionProfilesSection
        scope={scope}
        selectedCompanyId={companyId}
        onChange={refresh}
      />
    </div>
  );
}
