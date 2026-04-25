// "View History" affordance for full-page tools under /tools/*.
// Drops in a button + slide-out sheet bound to the caller's own run
// history for a single tool. Hidden for anonymous visitors (history is
// user-scoped — nothing to show).
//
// Usage (inside a /tools/* page header):
//
//   <ToolHistoryButton toolId="ai-resume-scorer" />
//
// The button re-runs the current page when the user clicks "Run again"
// inside the sheet; if that behavior needs customising (e.g. pre-fill
// inputs from a past run) pass `onRunAgain` to override the default.

import { useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolHistorySheet } from "@/components/ToolHistorySheet";
import { useAuth } from "@/lib/auth";

interface Props {
  toolId: string;
  /** Override the "Run again" click behavior. Default: close the sheet
   *  and scroll to the top of the page so the user can rerun with new
   *  inputs. */
  onRunAgain?: (toolId: string) => void;
  /** Button variant — tools that want a quieter affordance override. */
  variant?: "outline" | "ghost" | "secondary";
  /** Button size. */
  size?: "sm" | "default";
  className?: string;
}

export function ToolHistoryButton({
  toolId,
  onRunAgain,
  variant = "outline",
  size = "sm",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return null;

  const defaultRunAgain = () => {
    setOpen(false);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <History className="h-4 w-4 mr-2" />
        View History
      </Button>
      <ToolHistorySheet
        open={open}
        onOpenChange={setOpen}
        source={{ kind: "mine", toolId }}
        onRunAgain={onRunAgain ?? defaultRunAgain}
      />
    </>
  );
}
