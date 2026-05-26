import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { Loader2, MessageCircle, Send, Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";

/**
 * ContactPanel — single slide-out contact form used by every "Contact us" /
 * "Talk to us" / "Request a demo" CTA across the app (DRY anchor per
 * `feedback_extract_on_duplication`). Mounted globally in App.tsx so any
 * button anywhere can open it via `useContactPanel().openContactPanel(preset)`
 * without prop drilling or per-page form duplication.
 *
 * Inquiries POST to `/api/marketing/contact`, which writes a row to
 * `marketing_leads` (source = `contact_panel:<inquiryType>`) AND notifies
 * every super_admin via the `notifications` table.
 */

export type ContactInquiryType =
  | "sales"
  | "demo"
  | "nonprofit_discount"
  | "support"
  | "general";

export interface ContactPanelPreset {
  /** Inquiry kind — drives the lead `source` and the superadmin notification
   *  copy. Choose the closest match; "general" is the safe default. */
  inquiryType?: ContactInquiryType;
  /** Drawer header copy. Defaults to a per-inquiry-type string. */
  title?: string;
  /** Drawer subhead. Defaults to a per-inquiry-type string. */
  description?: string;
  /** Pre-fills the subject field. Locked when `subjectLocked` is true. */
  subject?: string;
  /** When true, the subject field renders read-only — used for CTAs whose
   *  context is unambiguous ("Request a demo", "Non-profit pricing"). */
  subjectLocked?: boolean;
  /** Pre-fills the message body — typically a short prompt. */
  prefillMessage?: string;
  /** Submit button label override. */
  submitLabel?: string;
}

const INQUIRY_DEFAULTS: Record<
  ContactInquiryType,
  {
    title: string;
    description: string;
    subject: string;
    submitLabel: string;
  }
> = {
  sales: {
    title: "Talk to our team",
    description:
      "Tell us what you're solving for and we'll get back to you within one business day.",
    subject: "Sales / pricing question",
    submitLabel: "Send message",
  },
  demo: {
    title: "Request a personalized demo",
    description:
      "We'll set up a walkthrough tailored to your role and team size.",
    subject: "Demo request",
    submitLabel: "Request demo",
  },
  nonprofit_discount: {
    title: "Reduced pricing for start-ups & non-profits",
    description:
      "Tell us about your organization — we offer special pricing for qualifying teams.",
    subject: "Reduced pricing inquiry",
    submitLabel: "Request reduced pricing",
  },
  support: {
    title: "Contact support",
    description:
      "Send our team a message and we'll get back to you as soon as we can.",
    subject: "Support request",
    submitLabel: "Send to support",
  },
  general: {
    title: "Get in touch",
    description: "Send us a message and we'll respond as soon as possible.",
    subject: "General inquiry",
    submitLabel: "Send message",
  },
};

interface ContactPanelContextValue {
  /** Opens the contact panel with an optional preset (inquiry type, subject,
   *  prefilled message). Pass nothing for a generic "Get in touch" form. */
  openContactPanel: (preset?: ContactPanelPreset) => void;
  /** Closes the panel programmatically. Rarely needed — Sheet handles the
   *  X / overlay / escape cases. */
  closeContactPanel: () => void;
}

const ContactPanelContext = createContext<ContactPanelContextValue | undefined>(
  undefined,
);

export function useContactPanel(): ContactPanelContextValue {
  const ctx = useContext(ContactPanelContext);
  if (!ctx) {
    throw new Error(
      "useContactPanel must be used inside <ContactPanelProvider>",
    );
  }
  return ctx;
}

export function ContactPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<ContactPanelPreset | null>(null);

  const openContactPanel = useCallback((next?: ContactPanelPreset) => {
    setPreset(next ?? null);
    setOpen(true);
  }, []);

  const closeContactPanel = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ openContactPanel, closeContactPanel }),
    [openContactPanel, closeContactPanel],
  );

  return (
    <ContactPanelContext.Provider value={value}>
      {children}
      <ContactPanelSheet
        open={open}
        onOpenChange={setOpen}
        preset={preset}
      />
    </ContactPanelContext.Provider>
  );
}

interface ContactPanelSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: ContactPanelPreset | null;
}

function ContactPanelSheet({
  open,
  onOpenChange,
  preset,
}: ContactPanelSheetProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const location = useLocation();

  // Inquiry type is local state — it starts from the preset on open, but the
  // free-form picker (rendered when no preset locks it) needs to mutate the
  // submitted payload, not just relabel the subject. Submit reads `inquiryType`
  // from this state.
  const [inquiryType, setInquiryType] = useState<ContactInquiryType>(
    preset?.inquiryType ?? "general",
  );
  const defaults = INQUIRY_DEFAULTS[inquiryType];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Re-seed every field each time the panel opens, so a preset change between
  // openings (e.g., user clicks "Request demo" then "Reduced pricing") doesn't
  // leak the previous subject into the new form.
  useEffect(() => {
    if (!open) return;
    const nextType = preset?.inquiryType ?? "general";
    setInquiryType(nextType);
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setCompany("");
    setPhone("");
    setSubject(preset?.subject ?? INQUIRY_DEFAULTS[nextType].subject);
    setMessage(preset?.prefillMessage ?? "");
    setSubmitting(false);
    setSubmitted(false);
  }, [open, preset, user?.name, user?.email]);

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    subject.trim().length > 0 &&
    message.trim().length > 0 &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await apiClient.post(
        "/api/marketing/contact",
        {
          name: name.trim(),
          email: email.trim(),
          company: company.trim() || undefined,
          phone: phone.trim() || undefined,
          inquiryType,
          subject: subject.trim(),
          message: message.trim(),
          page: location.pathname,
          role: user?.role ?? undefined,
        },
        null as any,
      );
      setSubmitted(true);
      toast({
        title: "Message sent",
        description: "We'll be in touch soon — thanks for reaching out.",
      });
    } catch (err) {
      toast({
        title: "Couldn't send your message",
        description:
          err instanceof Error
            ? err.message
            : "Please try again, or email info@hired.video directly.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            {preset?.title ?? defaults.title}
          </SheetTitle>
          <SheetDescription>
            {preset?.description ?? defaults.description}
          </SheetDescription>
        </SheetHeader>

        {submitted ? (
          <div className="mt-8 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-green-600" />
            </div>
            <h3 className="font-semibold text-lg">Thanks — we got it.</h3>
            <p className="text-sm text-muted-foreground">
              Our team will be in touch at{" "}
              <span className="font-medium text-foreground">{email}</span>{" "}
              shortly. You can close this panel.
            </p>
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label htmlFor="contact-name">Your name</Label>
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
                autoComplete="name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="contact-company">Company</Label>
                <Input
                  id="contact-company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Optional"
                  autoComplete="organization"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-phone">Phone</Label>
                <Input
                  id="contact-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Optional"
                  autoComplete="tel"
                />
              </div>
            </div>

            {/* Inquiry-type picker is hidden when a preset locks it — the
             *  CTA copy already tells the user what kind of inquiry this is.
             *  For the generic "general" preset we expose the picker so
             *  visitors who land via a non-specific button can self-select. */}
            {!preset?.inquiryType && (
              <div className="space-y-2">
                <Label htmlFor="contact-type">What's this about?</Label>
                <InquiryTypeSelect
                  value={inquiryType}
                  onChange={(v) => {
                    setInquiryType(v);
                    // Only overwrite the subject if the user hasn't edited
                    // it off the previous default — preserves typed-in
                    // subjects when the user changes their mind about the
                    // inquiry type.
                    if (
                      subject === INQUIRY_DEFAULTS[inquiryType].subject ||
                      subject.trim() === ""
                    ) {
                      setSubject(INQUIRY_DEFAULTS[v].subject);
                    }
                  }}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="contact-subject">Subject</Label>
              <Input
                id="contact-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                readOnly={preset?.subjectLocked === true}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-message">Message</Label>
              <Textarea
                id="contact-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what you need…"
                rows={6}
                required
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="sm:w-auto"
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit}
                className="flex-1 bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    {preset?.submitLabel ?? defaults.submitLabel}
                  </>
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground pt-1">
              We'll only use your contact info to reply to this inquiry. By
              submitting you agree to our{" "}
              <a
                href="/privacy"
                className="underline hover:text-foreground"
                target="_blank"
                rel="noreferrer"
              >
                privacy policy
              </a>
              .
            </p>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InquiryTypeSelect({
  value,
  onChange,
}: {
  value: ContactInquiryType;
  onChange: (v: ContactInquiryType) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ContactInquiryType)}>
      <SelectTrigger id="contact-type">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="general">General inquiry</SelectItem>
        <SelectItem value="sales">Sales / pricing</SelectItem>
        <SelectItem value="demo">Request a demo</SelectItem>
        <SelectItem value="nonprofit_discount">
          Non-profit / start-up discount
        </SelectItem>
        <SelectItem value="support">Support</SelectItem>
      </SelectContent>
    </Select>
  );
}
