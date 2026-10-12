// The one contact form — rendered inline on /contact and inside the global
// <ContactPanel> slide-out. Owns its fields, submit (typed client) and
// success state. Mount with a fresh `key` to re-seed from a new preset.
import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, Send } from "lucide-react";
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
import { useAuth } from "@/lib/auth";
import { submitContactInquiry } from "@/lib/services/contact-service";
import {
  CONTACT_INQUIRY_TYPES,
  inquiryKey,
  type ContactInquiryType,
  type ContactPanelPreset,
} from "@/lib/contact/contact-inquiry";

interface ContactFormProps {
  preset?: ContactPanelPreset | null;
  /** Renders Cancel / Close buttons that call this (panel usage). */
  onClose?: () => void;
  /** Prefix for field ids so two forms can coexist on one page. */
  idPrefix?: string;
}

export function ContactForm({ preset, onClose, idPrefix = "contact" }: ContactFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const location = useLocation();

  const [inquiryType, setInquiryType] = useState<ContactInquiryType>(preset?.inquiryType ?? "general");
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState(
    preset?.subject ?? t(inquiryKey(preset?.inquiryType ?? "general", "subject")),
  );
  const [message, setMessage] = useState(preset?.prefillMessage ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Auth can resolve after mount (inline on /contact): prefill only fields
  // the visitor hasn't typed into yet.
  useEffect(() => {
    if (user?.name) setName((v) => v || user.name || "");
    if (user?.email) setEmail((v) => v || user.email || "");
  }, [user?.name, user?.email]);

  const id = (field: string) => `${idPrefix}-${field}`;
  const canSubmit = [name, email, subject, message].every((v) => v.trim().length > 0) && !submitting;

  function changeInquiryType(next: ContactInquiryType) {
    // Only replace the subject while it is still the previous default, so a
    // typed-in subject survives a change of mind about the inquiry type.
    if (subject.trim() === "" || subject === t(inquiryKey(inquiryType, "subject"))) {
      setSubject(t(inquiryKey(next, "subject")));
    }
    setInquiryType(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await submitContactInquiry({
        name: name.trim(),
        email: email.trim(),
        company: company.trim() || undefined,
        phone: phone.trim() || undefined,
        inquiryType,
        subject: subject.trim(),
        message: message.trim(),
        page: location.pathname,
        role: user?.role ?? undefined,
      });
      setSubmitted(true);
      toast({ title: t("contactForm.toast.sentTitle"), description: t("contactForm.toast.sentBody") });
    } catch {
      toast({
        title: t("contactForm.toast.errorTitle"),
        description: t("contactForm.toast.errorBody"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-green/10 text-brand-green-text">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </span>
        <h3 className="text-lg font-semibold text-foreground">{t("contactForm.success.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("contactForm.success.body", { email })}</p>
        {onClose && (
          <Button variant="outline" className="mt-2 min-h-[44px]" onClick={onClose}>
            {t("contactForm.close")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
        <div className="space-y-2">
          <Label htmlFor={id("name")}>{t("contactForm.name.label")}</Label>
          <Input
            id={id("name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("contactForm.name.placeholder")}
            required
            autoComplete="name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("email")}>{t("contactForm.email.label")}</Label>
          <Input
            id={id("email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("contactForm.email.placeholder")}
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("company")}>{t("contactForm.company.label")}</Label>
          <Input
            id={id("company")}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder={t("contactForm.optional")}
            autoComplete="organization"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id("phone")}>{t("contactForm.phone.label")}</Label>
          <Input
            id={id("phone")}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("contactForm.optional")}
            autoComplete="tel"
          />
        </div>
      </div>

      {/* A preset inquiry type comes from a CTA that already says what this
          is about; the generic form lets the visitor pick. */}
      {!preset?.inquiryType && (
        <div className="space-y-2">
          <Label htmlFor={id("type")}>{t("contactForm.type.label")}</Label>
          <Select value={inquiryType} onValueChange={(v) => changeInquiryType(v as ContactInquiryType)}>
            <SelectTrigger id={id("type")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTACT_INQUIRY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(inquiryKey(type, "option"))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={id("subject")}>{t("contactForm.subject.label")}</Label>
        <Input
          id={id("subject")}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          readOnly={preset?.subjectLocked === true}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={id("message")}>{t("contactForm.message.label")}</Label>
        <Textarea
          id={id("message")}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("contactForm.message.placeholder")}
          rows={6}
          required
        />
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
        {onClose && (
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={onClose} disabled={submitting}>
            {t("contactForm.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={!canSubmit} className="min-h-[44px] flex-1">
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              {t("contactForm.sending")}
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" aria-hidden="true" />
              {preset?.submitLabel ?? t(inquiryKey(inquiryType, "submit"))}
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("contactForm.privacy.prefix")}{" "}
        <a href="/privacy" className="underline hover:text-foreground" target="_blank" rel="noreferrer">
          {t("contactForm.privacy.link")}
        </a>
        {t("contactForm.privacy.suffix")}
      </p>
    </form>
  );
}
