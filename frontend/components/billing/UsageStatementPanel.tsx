import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoneyCents } from "@/lib/format";
import { FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { billingService } from "@/lib/services/billing-service";
import { TokenUsageCard } from "@/components/billing/TokenUsageCard";
import type { UsageStatement, UsageStatementLine } from "@shared/usage-statement";

/**
 * Usage Statement — every metered consumption event (AI tokens, video publishes,
 * team invites, interview sessions, saved searches, companies, AI-tool calls)
 * recorded by [ServicesProcessor](../../../api/src/domains/services-processing/services-processor.ts)
 * is rolled up into a per-month statement. Free users still get a $0 close-out
 * statement so the same surface works for everyone.
 *
 * Lives as a sub-tab of the consolidated "Account & Billing" tab. Self-gates:
 * returns null for anonymous viewers.
 */
export function UsageStatementPanel() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [statement, setStatement] = useState<UsageStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setLoading(true);
    billingService
      .getUsageStatement()
      .then((s) => {
        if (cancelled) return;
        setStatement(s);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-6">
      <TokenUsageCard />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t("headings.usageStatement", { defaultValue: "Usage Statement" })}
          </CardTitle>
          <CardDescription>
            {t("messages.usageStatementDesc", {
              defaultValue:
                "Month-to-date consumption against your plan allowances. Both Free and Pro tiers receive a close-out statement on the 1st of each month.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : statement ? (
            <UsageStatementBody statement={statement} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function UsageStatementBody({ statement }: { statement: UsageStatement }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {t("labels.statementPeriod", { defaultValue: "Statement period" })}
          </p>
          <p className="font-medium">
            {new Date(statement.periodStart).toLocaleDateString()} –{" "}
            {new Date(statement.periodEnd).toLocaleDateString()}
          </p>
        </div>
        <Badge variant={statement.plan === "pro" ? "default" : "secondary"}>
          {statement.plan === "pro" ? "Pro" : "Free"}
        </Badge>
      </div>

      <Separator />

      <div className="space-y-3">
        {statement.lines.map((line) => (
          <StatementLineRow key={line.eventType} line={line} />
        ))}
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {t("labels.statementTotal", { defaultValue: "Close-out total" })}
          </p>
          <p className="text-2xl font-bold">
            {formatMoneyCents(statement.totalCents, statement.currency)}
          </p>
        </div>
        <Button variant="outline" disabled>
          {t("actions.downloadInvoice", { defaultValue: "Download invoice" })}
        </Button>
      </div>
    </>
  );
}

function StatementLineRow({ line }: { line: UsageStatementLine }) {
  const pctUsed = line.includedQuantity > 0
    ? Math.min(100, Math.round((line.consumedQuantity / line.includedQuantity) * 100))
    : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{line.label}</span>
        <span className="text-muted-foreground">
          {line.consumedQuantity.toLocaleString()}
          {line.includedQuantity > 0
            ? ` / ${line.includedQuantity.toLocaleString()} ${line.unit}`
            : ` ${line.unit}`}
        </span>
      </div>
      {line.includedQuantity > 0 && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pctUsed}%` }}
          />
        </div>
      )}
      {line.overageCents > 0 && (
        <p className="text-xs text-amber-600">
          Overage: {formatMoneyCents(line.overageCents, "USD")}
        </p>
      )}
    </div>
  );
}
