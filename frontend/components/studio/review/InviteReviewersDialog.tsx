/**
 * InviteReviewersDialog — owner-facing "invite people to review my resume" UI.
 *
 * Replaces the old copy-the-link-and-share-manually flow. The owner can:
 *   • pick platform contacts (their accepted connections) to invite, and/or
 *   • add external people by email (who can leave feedback WITHOUT signing up),
 *   • set the comment window (defaults to 42 hours), add a note, and send.
 * Each invitee gets their own review + share link; the backend fans out the
 * invite emails, in-app notifications, and lead capture. A copy-link section
 * is kept for ad-hoc manual sharing of the current review link.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Loader2, Mail, Search, Send, UserPlus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { userService, type PublicUser } from "@/lib/services/user-service";
import { resumeFeedbackService } from "@/lib/services/resume-feedback-service";
import {
  DEFAULT_REVIEW_EXPIRY_HOURS,
  type ReviewInvitee,
} from "@shared/resume-feedback";

interface InviteReviewersDialogProps {
  resumeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current review's shareable link, for manual copy. */
  shareUrl?: string;
  /** Called after invites are sent successfully. */
  onInvited?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Page size for the server-side connection typeahead. The server caps + orders
 *  by name; results beyond this are reached by narrowing the search. */
const SEARCH_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 250;

function contactName(u: PublicUser): string {
  return (
    u.fullName ||
    [u.firstName, u.lastName].filter(Boolean).join(" ") ||
    u.userName ||
    u.email ||
    "Member"
  );
}

export default function InviteReviewersDialog({
  resumeId,
  open,
  onOpenChange,
  shareUrl,
  onInvited,
}: InviteReviewersDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [results, setResults] = useState<PublicUser[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [noConnections, setNoConnections] = useState(false);
  // Every contact we've seen across searches, so selected chips + invitee names
  // resolve even after the result list changes underneath the selection.
  const [knownById, setKnownById] = useState<Map<string, PublicUser>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emails, setEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState("");
  const [message, setMessage] = useState("");
  const [expiryHours, setExpiryHours] = useState<number>(DEFAULT_REVIEW_EXPIRY_HOURS);
  const [sending, setSending] = useState(false);

  // Start each open with a fresh, empty search.
  useEffect(() => {
    if (!open) return;
    setContactQuery("");
    setDebouncedQuery("");
  }, [open]);

  // Debounce the search box so we don't hit the server on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(contactQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [contactQuery]);

  // Server-side typeahead — bounded, ordered, capped. No full-list download.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoadingContacts(true);
    userService
      .searchMyConnections(debouncedQuery, SEARCH_LIMIT)
      .then((rows) => {
        if (!active) return;
        const clean = rows.filter((r) => !!r.id);
        setResults(clean);
        setKnownById((prev) => {
          const next = new Map(prev);
          for (const c of clean) if (c.id) next.set(c.id, c);
          return next;
        });
        // Only the unfiltered baseline tells us "this user has no connections".
        if (debouncedQuery === "") setNoConnections(clean.length === 0);
      })
      .catch(() => {
        if (active) setResults([]);
      })
      .finally(() => {
        if (active) setLoadingContacts(false);
      });
    return () => {
      active = false;
    };
  }, [open, debouncedQuery]);

  const toggleContact = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addEmail = () => {
    const value = emailDraft.trim().toLowerCase();
    if (!value) return;
    if (!EMAIL_RE.test(value)) {
      toast({
        title: t("reviewInvite.invalidEmail"),
        description: value,
        variant: "destructive",
      });
      return;
    }
    if (!emails.includes(value)) setEmails((prev) => [...prev, value]);
    setEmailDraft("");
  };

  const removeEmail = (value: string) =>
    setEmails((prev) => prev.filter((e) => e !== value));

  // Selected contacts (resolved from the accumulated known map, so a pick
  // survives the result list changing). Surfaced as removable chips.
  const selectedContacts = useMemo(
    () =>
      [...selected]
        .map((id) => knownById.get(id))
        .filter((c): c is PublicUser => !!c),
    [selected, knownById],
  );

  const invitees = useMemo<ReviewInvitee[]>(() => {
    const byUser: ReviewInvitee[] = [...selected].map((id) => {
      const c = knownById.get(id);
      return { userId: id, name: c ? contactName(c) : undefined };
    });
    const byEmail: ReviewInvitee[] = emails.map((email) => ({ email }));
    return [...byUser, ...byEmail];
  }, [selected, knownById, emails]);

  // Count a valid-but-not-yet-added email draft too, so the Send button is
  // live the moment there's something to send (send() folds the draft in).
  const pendingEmail = emailDraft.trim().toLowerCase();
  const hasPendingEmail =
    EMAIL_RE.test(pendingEmail) && !emails.includes(pendingEmail);
  const totalCount = invitees.length + (hasPendingEmail ? 1 : 0);

  const send = async () => {
    // Fold a typed-but-not-added email into the batch so it isn't lost.
    const pending = emailDraft.trim().toLowerCase();
    const finalEmails =
      pending && EMAIL_RE.test(pending) && !emails.includes(pending)
        ? [...emails, pending]
        : emails;
    const finalInvitees: ReviewInvitee[] = [
      ...[...selected].map((id) => {
        const c = knownById.get(id);
        return { userId: id, name: c ? contactName(c) : undefined };
      }),
      ...finalEmails.map((email) => ({ email })),
    ];
    if (finalInvitees.length === 0) {
      toast({ title: t("reviewInvite.pickSomeone"), variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const created = await resumeFeedbackService.inviteReviewers({
        resumeId,
        invitees: finalInvitees,
        message: message.trim() || undefined,
        expiresInHours: expiryHours > 0 ? expiryHours : undefined,
      });
      toast({
        title: t("reviewInvite.sent"),
        description: t("reviewInvite.sentCount", { count: created.length }),
      });
      setSelected(new Set());
      setEmails([]);
      setEmailDraft("");
      setMessage("");
      onInvited?.();
      onOpenChange(false);
    } catch {
      toast({ title: t("reviewInvite.failed"), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const copyShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: t("reviewInvite.linkCopied"), description: t("reviewInvite.linkCopiedHint") });
    } catch {
      toast({ title: t("reviewInvite.copyFailed"), description: shareUrl, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("reviewInvite.title")}</DialogTitle>
          <DialogDescription>{t("reviewInvite.subtitle")}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="contacts" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="contacts">
              <UserPlus className="mr-1.5 h-4 w-4" /> {t("reviewInvite.tabContacts")}
            </TabsTrigger>
            <TabsTrigger value="email">
              <Mail className="mr-1.5 h-4 w-4" /> {t("reviewInvite.tabEmail")}
            </TabsTrigger>
          </TabsList>

          {/* Platform contacts — server-side typeahead (no full-list download) */}
          <TabsContent value="contacts" className="mt-3 space-y-2">
            {noConnections ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("reviewInvite.noContacts")}
              </p>
            ) : (
              <>
                {/* Picked contacts as removable chips (survive new searches). */}
                {selectedContacts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedContacts.map((c) => (
                      <Badge key={c.id} variant="secondary" className="gap-1">
                        {contactName(c)}
                        <button
                          type="button"
                          aria-label={t("reviewInvite.remove")}
                          onClick={() => toggleContact(c.id)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Search box — drives the debounced server typeahead. */}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  {loadingContacts && (
                    <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  <Input
                    value={contactQuery}
                    onChange={(e) => setContactQuery(e.target.value)}
                    placeholder={t("reviewInvite.searchContacts")}
                    className="pl-8"
                    aria-label={t("reviewInvite.searchContacts")}
                  />
                </div>

                <div className="max-h-52 space-y-1 overflow-auto pr-1">
                  {loadingContacts && results.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : results.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      {contactQuery
                        ? t("reviewInvite.noMatches", { query: contactQuery })
                        : t("reviewInvite.noContacts")}
                    </p>
                  ) : (
                    results.map((c) => {
                      const id = c.id;
                      const name = contactName(c);
                      const isSel = selected.has(id);
                      return (
                        <button
                          type="button"
                          key={id}
                          onClick={() => toggleContact(id)}
                          className={`flex w-full items-center gap-3 rounded-md border p-2 text-left transition ${
                            isSel ? "border-brand-purple bg-brand-purple/5" : "hover:bg-muted/50"
                          }`}
                        >
                          <Checkbox checked={isSel} aria-hidden tabIndex={-1} />
                          <Avatar className="h-7 w-7">
                            {c.avatar && <AvatarImage src={c.avatar} alt="" />}
                            <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{name}</span>
                            {c.headline && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {c.headline}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Result hint — server caps at SEARCH_LIMIT; narrow to see more. */}
                {results.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {results.length >= SEARCH_LIMIT
                      ? t("reviewInvite.refineHint", { count: SEARCH_LIMIT })
                      : t("reviewInvite.contactCount", { count: results.length })}
                    {selectedContacts.length > 0
                      ? ` · ${t("reviewInvite.selectedCount", { count: selectedContacts.length })}`
                      : ""}
                  </p>
                )}
              </>
            )}
          </TabsContent>

          {/* External email invites */}
          <TabsContent value="email" className="mt-3 space-y-3">
            <div className="flex gap-2">
              <Input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addEmail();
                  }
                }}
                placeholder={t("reviewInvite.emailPlaceholder")}
              />
              <Button type="button" variant="outline" onClick={addEmail}>
                {t("reviewInvite.add")}
              </Button>
            </div>
            {emails.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {emails.map((email) => (
                  <Badge key={email} variant="secondary" className="gap-1">
                    {email}
                    <button
                      type="button"
                      aria-label={t("reviewInvite.remove")}
                      onClick={() => removeEmail(email)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("reviewInvite.emailHint")}</p>
          </TabsContent>
        </Tabs>

        {/* Shared note + expiry */}
        <div className="space-y-3">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("reviewInvite.notePlaceholder")}
            rows={2}
          />
          <div className="flex items-center gap-2">
            <label htmlFor="review-expiry" className="text-sm text-muted-foreground">
              {t("reviewInvite.expiresLabel")}
            </label>
            <Input
              id="review-expiry"
              type="number"
              min={1}
              value={expiryHours}
              onChange={(e) => setExpiryHours(Math.max(1, Number(e.target.value) || 0))}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">{t("reviewInvite.hours")}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          {shareUrl ? (
            <Button type="button" variant="ghost" size="sm" onClick={copyShare}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> {t("reviewInvite.copyLink")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" disabled={sending || totalCount === 0} onClick={send}>
            {sending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            {totalCount > 0
              ? t("reviewInvite.sendCount", { count: totalCount })
              : t("reviewInvite.send")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
