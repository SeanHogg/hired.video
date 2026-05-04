// Marketing-styled empty state shown on surfaces where the current user owns
// the services list but has none yet. Reused on:
//   - PeopleDetail's Services tab (owner self-view)
//   - ServicesManagement's Services tab
// Keeping a single component prevents the two empty states from drifting.

import { ShoppingBag, Sparkles, Tag, Inbox, DollarSign, Plus, ArrowRight, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface AddFirstServiceCTAProps {
  /** Click handler for an in-place action (e.g. open the Create dialog). Mutually exclusive with `href`. */
  onClick?: () => void;
  /** Navigation target for callers that need to send the user elsewhere first. Mutually exclusive with `onClick`. */
  href?: string;
  /** Shows a spinner and disables the action button (e.g. while opt-in is in flight). */
  loading?: boolean;
}

const VALUE_PROPS: Array<{ icon: typeof Tag; label: string }> = [
  { icon: Tag,        label: "Set your own price" },
  { icon: Inbox,      label: "Manage inquiries in one inbox" },
  { icon: DollarSign, label: "Get paid securely" },
];

export default function AddFirstServiceCTA({ onClick, href, loading }: AddFirstServiceCTAProps) {
  return (
    <Card className="border-brand-purple/20 bg-gradient-to-br from-brand-purple/5 to-brand-blue/5">
      <CardContent className="p-6 md:p-8">
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
          <div className="relative mb-4">
            <ShoppingBag className="h-10 w-10 text-brand-purple" />
            <Sparkles className="h-4 w-4 text-brand-blue absolute -top-1 -right-1" />
          </div>
          <h3 className="text-xl md:text-2xl font-bold mb-2">
            Sell your expertise on your profile
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            List resume reviews, interview coaching, headhunting, or any service
            you offer. Buyers will be able to request or purchase it directly
            from your profile.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 w-full">
            {VALUE_PROPS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 text-sm text-muted-foreground justify-center"
              >
                <Icon className="h-4 w-4 text-brand-purple shrink-0" />
                <span>{label}</span>
              </div>
            ))}
          </div>
          {href ? (
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
              disabled={loading}
            >
              <Link to={href}>
                <Plus className="h-4 w-4 mr-2" />
                Add your first service
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          ) : (
            <Button
              size="lg"
              className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
              onClick={onClick}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Add your first service
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
