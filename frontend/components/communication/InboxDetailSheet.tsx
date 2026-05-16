/**
 * InboxDetailSheet — slide-out side panel showing one inbox item's full
 * detail. Today scoped to external-email rows (the only stream that has
 * a body to show); notifications + connection requests already render
 * everything they have inline on the list row.
 *
 * Anchored as a right Sheet so the list stays visible behind it.
 *
 * The detail body comes from GET /api/inbox/external-emails/:id — a
 * second fetch (not bundled into the list response) because the list
 * payload only ships the row snippet to keep the polling round-trip
 * cheap.
 */

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Mail, Trash2, MailOpen, ExternalLink, Briefcase } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { HubItem } from "@/hooks/use-comm-hub";

interface ExternalEmailDetail {
  id: string;
  provider: string;
  accountId: string;
  accountLabel: string;
  accountEmail: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  category: string | null;
  score: number | null;
  summary: string | null;
  linkedJobId: string | null;
  applyUrl: string | null;
  isRead: boolean;
  isArchived: boolean;
  receivedAt: string;
  providerMessageId: string;
  providerThreadId: string | null;
}

export interface InboxDetailSheetProps {
  item: HubItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkUnread: (id: string) => void;
  onDismiss: (id: string) => void;
}

function providerOpenUrl(detail: ExternalEmailDetail): string | null {
  if (detail.provider === "gmail") {
    // Gmail thread URLs accept the providerMessageId in the form #all/<id>
    return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(detail.accountEmail)}#all/${detail.providerMessageId}`;
  }
  if (detail.provider === "outlook") {
    return `https://outlook.live.com/mail/0/inbox/id/${detail.providerMessageId}`;
  }
  return null;
}

function safeRelativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export function InboxDetailSheet({
  item,
  open,
  onOpenChange,
  onMarkUnread,
  onDismiss,
}: InboxDetailSheetProps) {
  const [detail, setDetail] = useState<ExternalEmailDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const externalEmailId =
    item?.kind === "external_email" ? item.externalEmailId ?? null : null;

  useEffect(() => {
    if (!open || !externalEmailId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    apiClient
      .get<ExternalEmailDetail>(`/api/inbox/external-emails/${externalEmailId}`)
      .then((res) => {
        if (cancelled) return;
        if (res.data) setDetail(res.data);
        else setError("Email not found");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load email");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, externalEmailId]);

  const isEmail = item?.kind === "external_email";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col"
        aria-describedby="inbox-detail-description"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-emerald-600" />
            <span className="truncate">
              {item?.title ?? "Inbox item"}
            </span>
          </SheetTitle>
          <SheetDescription id="inbox-detail-description">
            {item ? safeRelativeTime(item.timestamp) : ""}
          </SheetDescription>
        </SheetHeader>

        {!isEmail ? (
          <div className="p-5 text-sm text-muted-foreground">
            Detail view is currently only available for synced emails.
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-5 text-sm text-destructive">{error}</div>
        ) : detail ? (
          <>
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-4">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">From</div>
                  <div className="text-sm font-medium">
                    {detail.fromName?.trim()
                      ? `${detail.fromName} <${detail.fromEmail}>`
                      : detail.fromEmail}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Mailbox</div>
                  <div className="text-sm">
                    {detail.provider} · {detail.accountLabel}
                  </div>
                </div>

                {(detail.category || detail.score != null) && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {detail.category && (
                      <Badge variant="secondary" className="uppercase tracking-wide">
                        {detail.category.replace(/_/g, " ")}
                      </Badge>
                    )}
                    {detail.score != null && (
                      <Badge variant="outline">
                        {Math.round(detail.score * 100)}% confidence
                      </Badge>
                    )}
                    {detail.linkedJobId && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                        <Briefcase className="h-3 w-3 mr-1" />
                        Linked to job
                      </Badge>
                    )}
                  </div>
                )}

                {detail.summary && (
                  <div className="rounded border bg-muted/40 p-3 space-y-1">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      AI summary
                    </div>
                    <p className="text-sm">{detail.summary}</p>
                  </div>
                )}

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Subject</div>
                  <div className="text-sm font-medium">
                    {detail.subject || "(no subject)"}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Body</div>
                  <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed bg-background border rounded p-3 max-h-[40vh] overflow-auto">
                    {detail.bodyText?.trim() ||
                      stripHtmlForPreview(detail.bodyHtml) ||
                      detail.snippet ||
                      "(no body)"}
                  </pre>
                </div>
              </div>
            </ScrollArea>

            <div className="border-t px-5 py-3 flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onMarkUnread(detail.id);
                }}
              >
                <MailOpen className="h-3.5 w-3.5 mr-1" />
                Mark unread
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onDismiss(detail.id);
                  onOpenChange(false);
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Dismiss
              </Button>
              {providerOpenUrl(detail) && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                >
                  <a
                    href={providerOpenUrl(detail)!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Open in {detail.provider}
                  </a>
                </Button>
              )}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** Strip HTML tags + collapse whitespace for the plain-text body
 *  fallback. The sanitiser is intentionally crude — the iframe-based
 *  rich render is tracked as a follow-up Gap Register entry; today we
 *  trade fidelity for safety. */
function stripHtmlForPreview(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export default InboxDetailSheet;
