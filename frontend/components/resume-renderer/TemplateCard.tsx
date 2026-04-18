import { Check, Eye, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import { SAMPLE_RESUME } from "@/lib/sample-resume";
import { isTemplateUnlocked } from "@/lib/template-unlocks";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";

interface TemplateCardProps {
  descriptor: ResumeTemplateDescriptor;
}

function priceLabel(cents?: number): string {
  if (!cents || cents <= 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function TemplateCard({ descriptor }: TemplateCardProps) {
  const navigate = useNavigate();
  const { addItem, openCart } = useCart();
  const isFree = !descriptor.priceCents || descriptor.priceCents <= 0;

  // Re-render when an unlock event fires (other card in gallery, checkout, etc.)
  const [unlocked, setUnlocked] = useState(() => isTemplateUnlocked(descriptor.id));
  useEffect(() => {
    const handler = () => setUnlocked(isTemplateUnlocked(descriptor.id));
    window.addEventListener("hired:template-unlocked", handler);
    return () => window.removeEventListener("hired:template-unlocked", handler);
  }, [descriptor.id]);

  const openPreview = () => navigate(`/resumes/sample?template=${descriptor.id}`);

  // All templates — free or paid — route through the cart so the user can
  // review the item and proceed to checkout. Unlocking happens after checkout
  // completes (see Checkout.tsx), not at add-to-cart time.
  const handlePrimary = () => {
    addItem({
      id: `template:${descriptor.id}`,
      name: descriptor.name,
      price: (descriptor.priceCents ?? 0) / 100,
      type: "template",
    });
    openCart();
  };

  return (
    <div className="group rounded-xl border bg-card overflow-hidden flex flex-col hover:shadow-lg transition-shadow">
      {/* Thumbnail — scales the real renderer to a card-sized preview. */}
      <button
        type="button"
        onClick={openPreview}
        aria-label={`Preview ${descriptor.name}`}
        className="relative w-full h-72 overflow-hidden bg-muted/30 border-b block"
      >
        <div className="absolute inset-0 flex items-start justify-center pointer-events-none">
          <div
            className="origin-top"
            style={{
              transform: "scale(0.32)",
              transformOrigin: "top center",
              width: "900px",
            }}
          >
            <DeclarativeResumeRenderer resume={SAMPLE_RESUME} descriptor={descriptor} embedded />
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
          <Badge variant="secondary" className="shadow">
            <Eye className="w-3 h-3 mr-1" />Preview
          </Badge>
        </div>
      </button>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold leading-tight">{descriptor.name}</h3>
            {descriptor.industry && (
              <p className="text-xs text-muted-foreground mt-0.5">{descriptor.industry}</p>
            )}
          </div>
          <Badge variant={isFree ? "secondary" : "default"} className="shrink-0">
            {priceLabel(descriptor.priceCents)}
          </Badge>
        </div>

        {descriptor.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{descriptor.description}</p>
        )}

        <div className="flex gap-2 mt-auto">
          <Button variant="outline" size="sm" className="flex-1" onClick={openPreview}>
            <Eye className="w-4 h-4 mr-1" />Preview
          </Button>
          {unlocked ? (
            <Button size="sm" className="flex-1" variant="secondary" disabled>
              <Check className="w-4 h-4 mr-1" />Unlocked
            </Button>
          ) : (
            <Button size="sm" className="flex-1" onClick={handlePrimary}>
              <ShoppingCart className="w-4 h-4 mr-1" />Add to Cart
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
