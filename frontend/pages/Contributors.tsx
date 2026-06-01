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
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/AppShell";

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
  const { user } = useAuth();  if (!user) return null;

  return (
    <AppShell bgClassName="bg-background">
<main className="px-4 sm:px-6 lg:px-8 pb-12">
          <header className="py-6">
            <h1 className="text-2xl font-bold">Contributors</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Invite a video editor or coach to make videos on your behalf, and see
              who has invited you to edit on theirs. Anything you create as a
              contributor stays with the person who invited you, and shows up on
              your portfolio as a credit.
            </p>
          </header>

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
      toast({ title: "Invitation sent", description: "They can now edit on your behalf in Studio." });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't invite", description: err?.message ?? "Try again later.", variant: "destructive" });
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete<{ id: string; revoked: boolean }>(`/api/workspaces/grants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-grants", "given"] });
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast({ title: "Access revoked" });
    },
  });

  const activeGrants = (data ?? []).filter((g) => g.isActive);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="w-5 h-5" /> People I've Invited
        </CardTitle>
        <CardDescription>
          Editors / coaches who can act on your behalf in Studio. Their work shows
          up on their own profile as a portfolio credit and on yours as a regular video.
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
              Contributor email
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="contributor@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={invite.isPending || !email.trim()}>
            {invite.isPending ? "Inviting…" : "Invite"}
          </Button>
        </form>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && activeGrants.length === 0 && (
          <p className="text-sm text-muted-foreground">
            You haven't invited anyone yet. The contributor must already have a
            hired.video account before you can invite them.
          </p>
        )}
        <ul className="divide-y rounded-md border">
          {activeGrants.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {g.contributorName ?? g.contributorEmail ?? "Unknown"}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Mail className="w-3 h-3" /> {g.contributorEmail ?? "—"}
                  <Badge variant="outline" className="text-[10px]">{g.role}</Badge>
                  <Badge variant="outline" className="text-[10px]">{g.scope}</Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => revoke.mutate(g.id)}
                disabled={revoke.isPending}
                aria-label="Revoke access"
              >
                <Trash2 className="w-4 h-4" />
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
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="w-5 h-5" /> People Who've Invited Me
        </CardTitle>
        <CardDescription>
          Subjects who have authorised you to make videos on their behalf. Switch
          between workspaces from the dropdown in the Studio sidebar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && grants.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No-one has invited you as a contributor yet.
          </p>
        )}
        <ul className="divide-y rounded-md border">
          {grants.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {g.subjectName ?? g.subjectEmail ?? "Unknown"}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Mail className="w-3 h-3" /> {g.subjectEmail ?? "—"}
                  <Badge variant="outline" className="text-[10px]">{g.role}</Badge>
                  {g.expiresAt && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Expires {new Date(g.expiresAt).toLocaleDateString()}
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
