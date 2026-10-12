// Contributors — self-serve contributor management page.
//
// Surfaces two surfaces for a single user:
//   1. "People I've invited" — grants where the caller is the subject.
//      Lets a job seeker invite a video editor / coach to edit videos
//      on their behalf, and revoke that access later.
//   2. "Invitations I've accepted" — grants where the caller is the
//      contributor. Surfaces who has authorised them to act, alongside
//      the workspace switcher (acting on behalf of someone is opt-in
//      per draft).
//
// Self-gates per the project DRY rule: the page returns null when the
// user isn't authenticated. Lists collapse when empty rather than
// being wrapped in `if (count > 0)` guards by the caller.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePageChrome } from "@/lib/seo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Trash2, UserPlus, UserCheck, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import MonoChip from "@/components/templates/MonoChip";

interface GrantRow {
  id: string;
  contributorUserId?: string;
  contributorName?: string | null;
  contributorEmail?: string | null;
  subjectUserId?: string;
  subjectName?: string | null;
  subjectEmail?: string | null;
  role: "editor" | "reviewer";
  scope: "studio" | "all";
  isActive: boolean;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt?: string | null;
}

export default function Contributors() {
  usePageChrome();
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;

  return (
    <AppShell bgClassName="bg-background">
<main className="mx-auto w-full max-w-[1200px] px-6 pb-16">
        <PageHeader
          title={t("headings.contributors.title")}
          description={t("messages.contributors.intro")}
        />
        <div className="grid gap-6">
          <InvitedByMeSection />
          <InvitedToMeSection />
        </div>
      </main>
</AppShell>
  );
}

// ─── Section 1: people I've invited ─────────────────────────────────────────

function InvitedByMeSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [email, setEmail] = useState("");

  const { data, isLoading } = useQuery<GrantRow[]>({
    queryKey: ["workspace-grants", "given"],
    queryFn: async () => {
      const res = await apiClient.get<GrantRow[]>("/api/workspaces/grants");
      return res.data;
    },
  });

  const invite = useMutation({
    mutationFn: async (contributorEmail: string) => {
      const res = await apiClient.post<GrantRow>("/api/workspaces/grants", {
        contributorEmail,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-grants", "given"] });
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setEmail("");
      toast({ title: t("messages.contributors.inviteSentTitle"), description: t("messages.contributors.inviteSentDescription") });
    },
    onError: (err: any) => {
      toast({ title: t("messages.contributors.inviteErrorTitle"), description: err?.message ?? t("messages.contributors.tryAgainLater"), variant: "destructive" });
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete<{ id: string; revoked: boolean }>(`/api/workspaces/grants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-grants", "given"] });
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast({ title: t("messages.contributors.accessRevoked") });
    },
  });

  const activeGrants = (data ?? []).filter((g) => g.isActive);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary" aria-hidden="true">
            <UserPlus className="h-5 w-5" />
          </span>
          {t("headings.contributors.peopleIveInvited")}
        </CardTitle>
        <CardDescription>
          {t("messages.contributors.peopleIveInvitedDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) invite.mutate(email.trim());
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <div className="flex-1">
            <Label htmlFor="invite-email" className="sr-only">
              {t("labels.contributors.contributorEmail")}
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder={t("labels.contributors.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="min-h-[44px]" disabled={invite.isPending || !email.trim()}>
            {invite.isPending ? t("actions.contributors.inviting") : t("actions.contributors.invite")}
          </Button>
        </form>

        {isLoading && <p className="text-sm text-muted-foreground">{t("status.loading")}</p>}
        {!isLoading && activeGrants.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("messages.contributors.noneInvitedYet")}
          </p>
        )}
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border empty:hidden">
          {activeGrants.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-foreground">
                  {g.contributorName ?? g.contributorEmail ?? t("labels.unknown")}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="w-3 h-3" /> {g.contributorEmail ?? "—"}
                  <MonoChip>{g.role}</MonoChip>
                  <MonoChip>{g.scope}</MonoChip>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => revoke.mutate(g.id)}
                disabled={revoke.isPending}
                aria-label={t("labels.contributors.revokeAccess")}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─── Section 2: invitations granted to me ───────────────────────────────────

function InvitedToMeSection() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<GrantRow[]>({
    queryKey: ["workspace-grants", "received"],
    queryFn: async () => {
      const res = await apiClient.get<GrantRow[]>("/api/workspaces/granted-to-me");
      return res.data;
    },
  });

  const grants = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary" aria-hidden="true">
            <UserCheck className="h-5 w-5" />
          </span>
          {t("headings.contributors.peopleWhoveInvitedMe")}
        </CardTitle>
        <CardDescription>
          {t("messages.contributors.peopleWhoveInvitedMeDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">{t("status.loading")}</p>}
        {!isLoading && grants.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("messages.contributors.noneInvitedMeYet")}
          </p>
        )}
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border empty:hidden">
          {grants.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-foreground">
                  {g.subjectName ?? g.subjectEmail ?? t("labels.unknown")}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="w-3 h-3" /> {g.subjectEmail ?? "—"}
                  <MonoChip>{g.role}</MonoChip>
                  {g.expiresAt && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {t("labels.contributors.expires", { date: new Date(g.expiresAt).toLocaleDateString() })}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
