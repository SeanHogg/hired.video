// eslint-page-chrome: skip - auth / verification flow - ships its own minimal chrome (pre-existing; #1869).
/**
 * CertificateVerify — public verification + display of a hired.video
 * learning certificate.
 *
 * Route: `/verify/:certNumber`
 *
 * The recipient lands here after passing a course (CourseLearner's
 * "View certificate" CTA). Recruiters / hiring managers / LinkedIn
 * viewers also land here from a shared cert URL. Fully public — the
 * cert number is the only auth token, mirroring the verify
 * convention used by Credly / Accredible / Coursera.
 *
 * The HMAC signature itself stays server-side (the
 * `/api/verify/:certNumber` endpoint replays validation and returns
 * a `valid` boolean + the canonical payload). This page renders the
 * payload + a "Verified" badge — no client-side signature math.
 *
 * Print-friendly: the layout uses `print:` Tailwind variants so users
 * can hit Ctrl-P and get a clean one-page certificate. No separate
 * PDF generator needed for v1.
 */

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { useSEO } from "@/lib/seo";
import { verifyCertificate, type VerifyResult } from "@/lib/courses/courses-api";

export default function CertificateVerify() {
  const { certNumber } = useParams<{ certNumber: string }>();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);

  useSEO("/verify", {
    title: result?.valid && result.courseTitle
      ? `${result.recipientName ?? "Certificate"} · ${result.courseTitle} · hired.video`
      : "Certificate verification · hired.video",
    description:
      "Verify a hired.video learning certificate. HMAC-signed, tamper-evident, course-pass-issued.",
  });

  useEffect(() => {
    if (!certNumber) return;
    let cancelled = false;
    setLoading(true);
    verifyCertificate(certNumber)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch(() => {
        if (!cancelled) setResult({ valid: false, reason: "not_found" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [certNumber]);

  if (loading) {
    return (
      <AppShell>
        <div className="min-h-[50vh] flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Verifying certificate…
        </div>
      </AppShell>
    );
  }

  // Invalid / tampered / revoked / expired — all flow through the same
  // single error surface so the consumer knows the cert can't be trusted
  // without us having to fan out a per-reason copy block.
  if (!result || !result.valid) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto p-6">
          <Card>
            <CardContent className="p-8 text-center space-y-4">
              <div className="mx-auto h-14 w-14 rounded-full bg-red-50 flex items-center justify-center">
                <ShieldX className="h-7 w-7 text-red-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Certificate not verified</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {result?.reason === "tampered"
                    ? "The certificate payload has been altered after issuance."
                    : result?.reason === "revoked"
                      ? "The issuing author has revoked this certificate."
                      : result?.reason === "expired"
                        ? "This certificate has expired."
                        : "No certificate was found with this number."}
                </p>
                <p className="text-xs text-muted-foreground mt-2 font-mono">
                  Cert: {certNumber}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/tools?tab=learning">Browse courses</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  const issuedDate = result.issuedAt
    ? new Date(result.issuedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;
  const expiresDate = result.expiresAt
    ? new Date(result.expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto p-4 md:p-6 print:p-0">
        <Card className="print:shadow-none print:border-0">
          <CardContent className="p-8 md:p-12 space-y-6 text-center">
            {/* Cert chrome — gold rule top + bottom, watermark-ish icon */}
            <div className="border-t-4 border-amber-400 -mx-8 md:-mx-12" />
            <div className="space-y-2 pt-2">
              <div className="mx-auto h-14 w-14 rounded-full bg-amber-50 flex items-center justify-center print:border print:border-amber-400">
                <Award className="h-8 w-8 text-amber-600" />
              </div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Certificate of Completion
              </p>
              <p className="text-sm text-muted-foreground">This certifies that</p>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                {result.recipientName ?? "Recipient"}
              </h1>
              <p className="text-sm text-muted-foreground">has successfully completed</p>
              <h2 className="text-2xl font-semibold tracking-tight">
                {result.courseTitle ?? "the course"}
              </h2>
            </div>

            {result.finalScorePct != null && (
              <p className="text-sm">
                Final score:{" "}
                <span className="font-semibold tabular-nums">{Math.round(result.finalScorePct)}%</span>
              </p>
            )}

            <div className="border-t pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-muted-foreground">
              <div>
                <div className="uppercase tracking-wide">Issued</div>
                <div className="text-foreground font-medium mt-0.5">{issuedDate ?? "—"}</div>
              </div>
              <div>
                <div className="uppercase tracking-wide">Issued by</div>
                <div className="text-foreground font-medium mt-0.5">{result.issuer ?? "hired.video"}</div>
              </div>
              <div>
                <div className="uppercase tracking-wide">{expiresDate ? "Expires" : "Validity"}</div>
                <div className="text-foreground font-medium mt-0.5">
                  {expiresDate ?? "Does not expire"}
                </div>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full">
              <ShieldCheck className="h-3.5 w-3.5" />
              Verified · HMAC-signed by hired.video
            </div>

            <p className="text-[10px] font-mono text-muted-foreground break-all">
              Cert #{result.certNumber}
            </p>

            <div className="border-b-4 border-amber-400 -mx-8 md:-mx-12" />

            <div className="flex items-center justify-center gap-2 pt-2 print:hidden">
              <Button onClick={() => window.print()} variant="outline" size="sm">
                Print / save as PDF
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    navigator.clipboard.writeText(window.location.href);
                  }
                }}
              >
                <span>Copy share link</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
