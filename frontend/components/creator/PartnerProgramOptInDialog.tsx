"use client";

/**
 * Writer Partner Program opt-in dialog — gap #173. Thin wrapper over the
 * shared CreatorConsentDialog with the right legal-doc kind + copy.
 * Earn-gate (active Pro sub) is enforced server-side in
 * `POST /api/articles/partner-program/opt-in` — the dialog itself only
 * captures consent.
 */

import { useEffect, useState } from "react";
import CreatorConsentDialog from "@/components/CreatorConsentDialog";
import { apiClient } from "@/lib/api-client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after the opt-in row writes successfully. Parent typically
   *  toasts + refreshes the article-editor state to surface the
   *  "earning eligible" badge. */
  onOptedIn?: () => void;
}

export default function PartnerProgramOptInDialog({ open, onOpenChange, onOptedIn }: Props) {
  const [optedIn, setOptedIn] = useState<{ id: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    apiClient
      .get<{ data: { optIn: { id: string } | null } }>(`/api/articles/partner-program/status`)
      .then((res) => setOptedIn((res.data as any).optIn))
      .catch(() => setOptedIn(null));
  }, [open]);

  return (
    <CreatorConsentDialog
      open={open}
      onOpenChange={onOpenChange}
      title={optedIn ? "Reconfirm Partner Program" : "Join the Partner Program"}
      termsKind="partner_program_terms"
      consentLabel="I have read and agree to the Partner Program terms. I understand my engagement on eligible articles will earn a share of the monthly pool (paid as a Tremendous gift card after a 60-day hold, $50 minimum)."
      withPricing={false}
      onConfirm={async ({ acceptedDocId }) => {
        await apiClient.post(`/api/articles/partner-program/opt-in`, {
          legalDocsAccepted: acceptedDocId ? [acceptedDocId] : [],
        });
        onOptedIn?.();
      }}
      cancelLabel="Not now"
    />
  );
}
