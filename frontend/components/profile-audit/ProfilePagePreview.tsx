// Compact "as-it-appears-on-the-profile-page" preview. Renders the same
// shape the user sees at /people/me — header chip strip + About section —
// so the audit tool's before/after panels look like the real surface.
//
// Used twice on the audit page (current vs proposed), driven by the same
// data shape so we can't accidentally render one half differently from
// the other.

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, MapPin } from "lucide-react";

export interface ProfilePagePreviewData {
  fullName: string;
  avatarUrl: string | null;
  headline: string | null;
  summary: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  location: string | null;
  openToWork: boolean;
}

interface Props {
  data: ProfilePagePreviewData;
  /** Tag shown above the card to label this side (e.g. "Current", "Proposed"). */
  variantLabel?: string;
  /** Tailwind ring color for the wrapper — drives the visual diff. */
  variantRingClassName?: string;
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

export default function ProfilePagePreview({
  data,
  variantLabel,
  variantRingClassName,
}: Props) {
  return (
    <div className={`rounded-lg ${variantRingClassName ? `ring-2 ${variantRingClassName}` : ""}`}>
      {variantLabel && (
        <div className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {variantLabel}
        </div>
      )}
      <div className="p-3 space-y-3">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start gap-4">
              <Avatar className="w-14 h-14 sm:w-20 sm:h-20 flex-shrink-0">
                <AvatarImage src={data.avatarUrl ?? undefined} alt={data.fullName} />
                <AvatarFallback>{initials(data.fullName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl sm:text-2xl font-semibold truncate">
                  {data.fullName}
                </h2>
                {data.headline ? (
                  <p className="text-sm sm:text-base mt-1 leading-snug">
                    {data.headline}
                  </p>
                ) : (
                  <p className="text-sm mt-1 italic text-muted-foreground">
                    No headline set
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {(data.currentRole || data.currentCompany) && (
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      {[data.currentRole, data.currentCompany].filter(Boolean).join(" • ")}
                    </span>
                  )}
                  {data.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {data.location}
                    </span>
                  )}
                  {data.openToWork && (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                      Open to Work
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">About</CardTitle>
          </CardHeader>
          <CardContent>
            {data.summary ? (
              <p className="whitespace-pre-line leading-relaxed text-sm text-muted-foreground">
                {data.summary}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No about / summary set
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
