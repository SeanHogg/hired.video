import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CreatedInterview, RecruiterTab } from "./helpers";
import { CreateInterviewPanel } from "./CreateInterviewPanel";
import { InterviewListPanel } from "./InterviewListPanel";
import { InviteLinkCard } from "./InviteLinkCard";

export function RecruiterView() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<RecruiterTab>("list");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const handleCreated = (interview: CreatedInterview) => {
    setInviteUrl(interview.inviteUrl);
    setTab("list");
  };

  return (
    <div className="space-y-6">
      {/* Tab toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant={tab === "list" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("list")}
        >
          <Users className="mr-2 h-4 w-4" />
          {t("studio.asyncInterview.tabInterviews")}
        </Button>
        <Button
          variant={tab === "create" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("create")}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("studio.asyncInterview.tabNew")}
        </Button>
      </div>

      {/* Invite link banner */}
      {inviteUrl && (
        <InviteLinkCard
          inviteUrl={inviteUrl}
          onDismiss={() => setInviteUrl(null)}
        />
      )}

      {/* Active panel */}
      {tab === "create" ? (
        <CreateInterviewPanel onCreated={handleCreated} />
      ) : (
        <InterviewListPanel />
      )}
    </div>
  );
}
