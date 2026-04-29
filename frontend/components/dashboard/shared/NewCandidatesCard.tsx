import React from "react";
import { UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface Candidate {
  userId?: string;
  candidateId?: string;
  name: string;
  email?: string;
  role?: string;
  location?: string;
  matchScore?: number;
  appliedAt?: Date;
  jobTitle: string;
  status?: string;
}

interface NewCandidatesCardProps {
  candidates?: Candidate[];
  loading?: boolean;
  maxItems?: number;
}

export function NewCandidatesCard({ candidates, loading = false, maxItems = 5 }: NewCandidatesCardProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t("headings.newCandidates")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 bg-muted/30 rounded-lg animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          {t("headings.newCandidates")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {candidates && candidates.length > 0 ? (
          <div className="space-y-3">
            {candidates.slice(0, maxItems).map((candidate, index) => (
              <div
                key={candidate.userId || candidate.candidateId || index}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
              >
                <div>
                  <div className="font-medium text-sm">{candidate.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {candidate.jobTitle}
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {candidate.status || t("labels.statusNew")}
                </Badge>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to="/people">{t("actions.viewAllCandidates")}</Link>
            </Button>
          </div>
        ) : (
          <div className="text-center py-8">
            <UserPlus className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{t("messages.noNewCandidates")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default NewCandidatesCard;
