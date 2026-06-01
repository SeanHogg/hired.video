/**
 * /references/shared/:token — recipient view of an NDA-gated reference
 * packet (#1677). Shows the label + an NDA gate; on accept, reveals the
 * granted contacts. Public (token is the ACL).
 */
import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSEO } from "@/lib/seo";
import { referencesService, type SharedView } from "@/lib/services/references-service";

export default function ReferencesShared(): JSX.Element {
  const { token = "" } = useParams<{ token: string }>();
  const location = useLocation();
  const [view, setView] = useState<SharedView | null | "notfound">(null);
  const [accepting, setAccepting] = useState(false);

  useSEO(location.pathname, { title: "Shared References · hired.video", description: "Confidential reference packet." });

  useEffect(() => {
    let cancelled = false;
    void referencesService
      .getShared(token)
      .then((v) => { if (!cancelled) setView(v ?? "notfound"); })
      .catch(() => { if (!cancelled) setView("notfound"); });
    return () => { cancelled = true; };
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    try {
      const v = await referencesService.acceptNda(token);
      setView(v ?? "notfound");
    } catch {
      setView("notfound");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <AppShell bgClassName="bg-background">
      <div className="px-4 py-16 max-w-2xl mx-auto">
        {view === null ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : view === "notfound" ? (
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Link unavailable</h1>
            <p className="text-muted-foreground">This reference link has been revoked, has expired, or doesn't exist.</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2">{view.label || "Confidential references"}</h1>
            {!view.unlocked ? (
              <Card>
                <CardContent className="p-6 space-y-4">
                  <p className="text-muted-foreground">
                    These references are shared in confidence. By continuing you agree to keep this
                    information confidential and use it solely to evaluate this candidate (NDA).
                  </p>
                  <Button onClick={accept} disabled={accepting}>
                    {accepting ? "…" : "I agree — show references"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {view.contacts.map((ct) => (
                  <Card key={ct.id}>
                    <CardContent className="p-5">
                      <p className="font-semibold">{ct.name}{ct.title ? `, ${ct.title}` : ""}</p>
                      <p className="text-sm text-muted-foreground">
                        {[ct.company, ct.relationship].filter(Boolean).join(" · ")}
                      </p>
                      <div className="mt-2 text-sm space-y-0.5">
                        {ct.email ? <p>✉ <a className="underline" href={`mailto:${ct.email}`}>{ct.email}</a></p> : null}
                        {ct.phone ? <p>☎ {ct.phone}</p> : null}
                        {ct.notes ? <p className="text-muted-foreground mt-1">{ct.notes}</p> : null}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
