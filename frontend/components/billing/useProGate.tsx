/**
 * useProGate — the in-place "this is a Pro feature" prompt, the Pro twin of
 * useAuthGate. Call `requirePro(reason)` at the top of a paid action: it
 * returns true for Pro (and admins — useSubscription is the one permission
 * primitive), otherwise opens a side sheet with the reason and THE Pro offer
 * (ProUpsellCard, $1.99/mo from shared/pricing.ts) and returns false. Render
 * `gate` once in the tree. Chain after useAuthGate's `requireAuth` so a
 * visitor first creates an account, then upgrades.
 *
 * The non-UI core (requirePro + the sheet's state) is `useProGateState`
 * (lib/hooks/use-pro-gate-state); this renders it as `<ProGateSheet>`.
 *
 * Client-side only — the paid API routes still enforce Pro themselves.
 */
import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ProUpsellCard from "@/components/studio/v2/focus/ProUpsellCard";
import { useProGateState, type ProGateSheetState } from "@/lib/hooks/use-pro-gate-state";

/** The in-place Pro offer sheet a gated action opens. */
export function ProGateSheet({ reason, onClose }: ProGateSheetState) {
  const { t } = useTranslation();
  return (
    <Sheet open={reason !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto bg-card sm:max-w-md">
        <SheetHeader className="mb-4 text-left">
          <SheetTitle className="font-display text-[28px] font-bold leading-[1.05] tracking-[-0.03em]">
            {t("billing.proGate.title")}
          </SheetTitle>
        </SheetHeader>
        {reason && <p className="mb-4 text-[15px] text-muted-foreground">{reason}</p>}
        <ProUpsellCard onNavigate={onClose} />
      </SheetContent>
    </Sheet>
  );
}

export function useProGate() {
  const { requirePro, sheet } = useProGateState();
  const gate = <ProGateSheet {...sheet} />;
  return { requirePro, gate };
}
