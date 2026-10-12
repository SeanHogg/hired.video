/**
 * PhoneSheet — the workspace's ONE bottom-sheet chrome on phones (the left
 * tool panel and the right slot both use it): a grabber you can drag down to
 * close, a kicker + title row with ✕, Escape closes. It stays MOUNTED while
 * closed (hidden) so its content keeps its state.
 */
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, X } from "lucide-react";
import { useDragToClose } from "@/hooks/use-drag-to-close";
import { cn } from "@/lib/utils";
import { useEscape } from "@/hooks/use-escape";

interface PhoneSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  kicker?: string;
  /** Drill-in: ‹ back to the parent panel. */
  onBack?: () => void;
  /** Leaves room for the bottom tool bar under it. */
  aboveBar?: boolean;
  children: ReactNode;
}

export default function PhoneSheet({ open, onClose, title, kicker, onBack, aboveBar = false, children }: PhoneSheetProps) {
  const { t } = useTranslation();
  const { offset, handleProps } = useDragToClose(onClose);

  useEscape(open, onClose);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={title}
      hidden={!open}
      style={offset ? { transform: `translateY(${offset}px)` } : undefined}
      className={cn(
        "fixed inset-x-0 z-50 max-h-[80dvh] flex-col rounded-t-[18px] border-t border-border bg-card shadow-[0_-14px_40px_-10px_hsl(var(--ink)/0.4)]",
        aboveBar ? "bottom-[calc(3.5rem+env(safe-area-inset-bottom))]" : "bottom-0 pb-[env(safe-area-inset-bottom)]",
        open ? "flex" : "hidden",
      )}
    >
      <div {...handleProps} className="flex flex-none cursor-grab justify-center pb-1 pt-2">
        <span aria-hidden="true" className="h-1 w-9 rounded-full bg-border" />
      </div>
      <div className="flex flex-none items-center gap-1 border-b border-border pb-1.5 pl-2 pr-1.5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={t("actions.back")}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <span className="w-2" />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {kicker && <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{kicker}</span>}
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("actions.close")}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {children}
    </div>
  );
}
