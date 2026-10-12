import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ContactForm } from "@/components/contact/ContactForm";
import { inquiryKey, type ContactPanelPreset } from "@/lib/contact/contact-inquiry";

/**
 * ContactPanel — the slide-out wrapper around the shared <ContactForm>, used
 * by every "Contact us" / "Talk to us" / "Request a demo" CTA. Mounted once
 * in App.tsx; any button opens it via
 * `useContactPanel().openContactPanel(preset)`.
 *
 * Inquiries POST to `/api/marketing/contact` (lib/services/contact-service.ts).
 */

interface ContactPanelContextValue {
  /** Opens the panel with an optional preset; nothing = generic form. */
  openContactPanel: (preset?: ContactPanelPreset) => void;
  closeContactPanel: () => void;
}

const ContactPanelContext = createContext<ContactPanelContextValue | undefined>(undefined);

export function useContactPanel(): ContactPanelContextValue {
  const ctx = useContext(ContactPanelContext);
  if (!ctx) {
    throw new Error("useContactPanel must be used inside <ContactPanelProvider>");
  }
  return ctx;
}

export function ContactPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<ContactPanelPreset | null>(null);
  // Bumped on every open so the form remounts and re-seeds from the preset.
  const [openCount, setOpenCount] = useState(0);

  const openContactPanel = useCallback((next?: ContactPanelPreset) => {
    setPreset(next ?? null);
    setOpenCount((n) => n + 1);
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
      <ContactPanelSheet open={open} onOpenChange={setOpen} preset={preset} formKey={openCount} />
    </ContactPanelContext.Provider>
  );
}

interface ContactPanelSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: ContactPanelPreset | null;
  formKey: number;
}

function ContactPanelSheet({ open, onOpenChange, preset, formKey }: ContactPanelSheetProps) {
  const { t } = useTranslation();
  const type = preset?.inquiryType ?? "general";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" aria-hidden="true" />
            {preset?.title ?? t(inquiryKey(type, "title"))}
          </SheetTitle>
          <SheetDescription>{preset?.description ?? t(inquiryKey(type, "description"))}</SheetDescription>
        </SheetHeader>
        <ContactForm key={formKey} preset={preset} onClose={() => onOpenChange(false)} idPrefix="contact-panel" />
      </SheetContent>
    </Sheet>
  );
}
