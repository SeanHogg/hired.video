import { useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  referencesService,
  type ReferenceSummary,
} from "@/lib/services/references-service";
import { useProfileSectionVisibility } from "./profile-sections-context";

interface ReferencesSectionProps {
  /** The profile owner's user id — whose references to surface. */
  profileUserId: string;
  isOwner: boolean;
}

/**
 * Public profile References section (#1677). Surfaces the owner's reference
 * contacts as names + role context ONLY — email/phone/notes never leave the
 * NDA-gated share flow. Data comes from the visibility-gated public summary
 * endpoint; the SSoT lives in `reference_contacts` (managed at /references).
 */
export default function ReferencesSection({ profileUserId, isOwner }: ReferencesSectionProps) {
  const { t } = useTranslation();
  const sectionVisible = useProfileSectionVisibility("references");
  const [refs, setRefs] = useState<ReferenceSummary[] | null>(null);

  useEffect(() => {
    if (!sectionVisible || !profileUserId) return;
    let active = true;
    void referencesService
      .listPublicContacts(profileUserId)
      .then((r) => active && setRefs(r))
      .catch(() => active && setRefs([]));
    return () => {
      active = false;
    };
  }, [sectionVisible, profileUserId]);

  if (!sectionVisible) return null;
  const list = refs ?? [];
  // Visitors never see an empty section; the owner gets an add prompt.
  if (list.length === 0 && !isOwner) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          {t("headings.references")}
        </CardTitle>
        {isOwner && (
          <Button asChild variant="ghost" size="sm">
            <Link to="/references">
              <Plus className="h-4 w-4 mr-1" />
              {list.length === 0 ? t("references.profile.add") : t("references.profile.manage")}
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            {t("references.profile.emptyOwner")}
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {list.map((r) => (
                <li key={r.id} className="rounded border p-3">
                  <p className="font-medium">
                    {r.name}
                    {r.title ? `, ${r.title}` : ""}
                  </p>
                  {(r.company || r.relationship) && (
                    <p className="text-sm text-muted-foreground">
                      {[r.company, r.relationship].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {t("references.profile.confidential")}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
