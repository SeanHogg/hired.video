import { Link } from "react-router-dom";
import { publicProfilePath } from "@shared/public-paths";
import { useTranslation } from "react-i18next";
import { ShoppingBag, Clock, MessageSquare, Sparkles } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ShareMenu from "@/components/share/ShareMenu";
import { serviceCategoryLabel } from "@/lib/taxonomy/category-labels";

export interface ServiceMarketplaceItem {
  id: string;
  type: "service";
  title: string;
  description: string | null;
  category: string | null;
  priceCents: number | null;
  priceVisible: boolean;
  deliveryDays: number | null;
  imageUrl: string | null;
  isPlatformService: boolean;
  provider: { id: string; name: string };
  providerSlug: string | null;
  providerAvatarUrl: string | null;
}

function formatPrice(cents: number | null) {
  if (cents == null) return "Contact for pricing";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function ServiceMarketplaceCard({ item }: { item: ServiceMarketplaceItem }) {
  const { t } = useTranslation();
  const providerHref = `${publicProfilePath(item.providerSlug || item.provider.id)}?tab=services`;
  const ctaHref = item.isPlatformService ? "/services?wizard=open" : providerHref;
  const shareUrl = `${window.location.origin}${providerHref}`;
  return (
    <BaseCard className={`h-full flex flex-col ${
      item.isPlatformService
        ? "bg-accent/40"
        : ""
    }`}>
      <div className="aspect-video bg-muted relative">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground" />
          </div>
        )}
        {item.category && (
          <Badge className="absolute top-2 left-2 bg-background/90 text-foreground border">{serviceCategoryLabel(item.category, t)}</Badge>
        )}
        {item.isPlatformService && (
          <Badge className="absolute top-2 right-2 bg-primary text-primary-foreground border-0">hired.video</Badge>
        )}
        <div className="absolute bottom-2 right-2">
          <ShareMenu
            variant="icon"
            align="end"
            className="h-7 w-7 bg-background/90 hover:bg-background"
            url={shareUrl}
            title={item.title}
          />
        </div>
      </div>
      <CardContent className="p-4 space-y-2 flex-1 flex flex-col">
        <h3 className="font-semibold leading-tight line-clamp-2">
          <Link to={ctaHref} className="hover:text-primary transition-colors">{item.title}</Link>
        </h3>
        {item.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
        )}
        {!item.isPlatformService && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {item.providerAvatarUrl ? (
              <img src={item.providerAvatarUrl} alt="" className="h-5 w-5 rounded-full" />
            ) : (
              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">
                {(item.provider.name ?? "?")[0]}
              </div>
            )}
            <span className="truncate">{item.provider.name}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm mt-auto pt-2 border-t">
          <span className="font-semibold">{formatPrice(item.priceCents)}</span>
          {item.deliveryDays != null && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> {item.deliveryDays}d
            </span>
          )}
        </div>
        <Button
          asChild
          size="sm"
          className={`w-full ${item.isPlatformService ? "bg-primary hover:bg-primary/90" : ""}`}
        >
          <Link to={ctaHref}>
            {item.isPlatformService ? (
              <><Sparkles className="h-3.5 w-3.5 mr-1" /> Enroll in Creator Program</>
            ) : (
              <><MessageSquare className="h-3.5 w-3.5 mr-1" /> Request quote</>
            )}
          </Link>
        </Button>
      </CardContent>
    </BaseCard>
  );
}
