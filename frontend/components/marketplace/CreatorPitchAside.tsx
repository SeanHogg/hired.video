// Right-rail "become a creator" pitch shown on marketplace item preview pages.
// Pulls double-duty: drives creator-side conversions on every preview, and
// reinforces the 95% creator share so buyers know where their money goes.

import { Sparkles, Store } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface CreatorPitchAsideProps {
  /** Item-type noun (plural). e.g. "resume templates", "job templates". */
  itemTypeLabel: string;
  /** Optional secondary card slotted below the pitch — usually the buy/use CTAs. */
  secondary?: React.ReactNode;
}

export default function CreatorPitchAside({
  itemTypeLabel,
  secondary,
}: CreatorPitchAsideProps) {
  return (
    <div className="p-5 space-y-4">
      <div className="rounded-xl border bg-gradient-to-br from-brand-purple/10 to-brand-blue/10 p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-purple">
          <Sparkles className="w-4 h-4" />
          Earn 95% on every sale
        </div>
        <h3 className="text-lg font-bold leading-tight">
          Design {itemTypeLabel}. Get paid.
        </h3>
        <p className="text-sm text-muted-foreground">
          Designers and recruiters keep 95% of every sale on the hired.video
          Marketplace. Your work reaches job seekers worldwide.
        </p>
        <Button asChild size="sm" className="w-full">
          <Link to="/services?wizard=open">
            <Store className="w-4 h-4 mr-1" />
            Become a Creator
          </Link>
        </Button>
      </div>

      {secondary}
    </div>
  );
}
