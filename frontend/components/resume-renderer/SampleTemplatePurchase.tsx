import { Check, ExternalLink, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";
import { resumeService } from "@/lib/services/resume-service";
import { isTemplateUnlocked } from "@/lib/template-unlocks";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";

interface Props {
  descriptor: ResumeTemplateDescriptor;
}

function priceLabel(cents?: number): string {
  if (!cents || cents <= 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function SampleTemplatePurchase({ descriptor }: Props) {
  const { isAuthenticated } = useAuth();
  const { addItem, openCart } = useCart();
  const isFree = !descriptor.priceCents || descriptor.priceCents <= 0;

  const [unlocked, setUnlocked] = useState(() => isTemplateUnlocked(descriptor.id));
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => setUnlocked(isTemplateUnlocked(descriptor.id));
    window.addEventListener("hired:template-unlocked", handler);
    return () => window.removeEventListener("hired:template-unlocked", handler);
  }, [descriptor.id]);

  // Re-check unlock state when the descriptor changes (user may have picked a
  // different template from the dropdown while staying on the sample page).
  useEffect(() => {
    setUnlocked(isTemplateUnlocked(descriptor.id));
  }, [descriptor.id]);

  useEffect(() => {
    if (!isAuthenticated) {
      setMasterResumeId(null);
      return;
    }
    let cancelled = false;
    resumeService
      .getUserResumes()
      .then((resumes) => {
        if (cancelled) return;
        const master = (resumes ?? []).find(
          (r: any) => r.isMaster === true || r.IsMaster === true,
        );
        const id = master ? ((master as any).id ?? (master as any).Id) : null;
        setMasterResumeId(id ?? null);
      })
      .catch(() => {
        if (!cancelled) setMasterResumeId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // All templates — free or paid — route through the cart for a consistent
  // checkout review step. Unlocking happens after checkout completes.
  const handlePurchase = () => {
    addItem({
      id: `template:${descriptor.id}`,
      name: descriptor.name,
      price: (descriptor.priceCents ?? 0) / 100,
      type: "template",
    });
    openCart();
  };

  const applyHref = masterResumeId
    ? `/resumes/${masterResumeId}?template=${descriptor.id}`
    : "/resumes";
  const applyLabel = masterResumeId ? "View on my resume" : "Go to my resumes";

  return (
    <div className="p-5 space-y-4">
      <div>
        <Badge variant="outline" className="mb-2 text-[10px] uppercase tracking-wide">
          Template Preview
        </Badge>
        <h3 className="font-semibold text-lg leading-tight">{descriptor.name}</h3>
        {descriptor.industry && (
          <p className="text-xs text-muted-foreground mt-1">{descriptor.industry}</p>
        )}
      </div>

      {descriptor.description && (
        <p className="text-sm text-muted-foreground">{descriptor.description}</p>
      )}

      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
        <span className="text-xs text-muted-foreground">Price</span>
        <Badge variant={isFree ? "secondary" : "default"} className="text-sm">
          {priceLabel(descriptor.priceCents)}
        </Badge>
      </div>

      {unlocked ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            <Check className="w-4 h-4" />
            Already purchased
          </div>
          <Button asChild size="sm" className="w-full">
            <Link to={applyHref}>
              <ExternalLink className="w-4 h-4 mr-1" />
              {applyLabel}
            </Link>
          </Button>
        </div>
      ) : (
        <Button size="sm" className="w-full" onClick={handlePurchase}>
          <ShoppingCart className="w-4 h-4 mr-1" />
          Add to Cart — {priceLabel(descriptor.priceCents)}
        </Button>
      )}

      {!isAuthenticated && !unlocked && (
        <p className="text-xs text-muted-foreground text-center">
          <Link to="/login" className="underline hover:text-foreground">Sign in</Link> to save
          this template to your account.
        </p>
      )}
    </div>
  );
}
