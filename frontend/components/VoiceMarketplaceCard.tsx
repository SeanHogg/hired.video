/**
 * VoiceMarketplaceCard
 *
 * Renders a public voice clone listing in the homepage media catalog (and
 * anywhere else the marketplace is shown). Plays the creator's preview audio
 * inline and adds the listing to the cart in one click.
 *
 * The actual TTS synthesis happens in-studio via the WebGPU TTS engines
 * (see lib/services/tts-engines.ts). This card does NOT load any model — it
 * just plays the pre-rendered preview Blob the creator uploaded at publish
 * time, and hands the cart line off to the Voice Marketplace checkout flow.
 */

"use client";

import { Link } from "react-router-dom";
import { formatPriceCents } from "@/lib/format";
import { Mic, Play, Pause, ShoppingCart, Check, Globe2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import { useCart } from "@/lib/cart-context";
import ShareMenu from "@/components/share/ShareMenu";
import { useAudioPreview } from "@/lib/hooks/useAudioPreview";
import WishlistButton from "@/components/wishlist/WishlistButton";
import { toast } from "sonner";

export interface VoiceMarketplaceCardItem {
  id: string;
  voiceCloneId: string;
  name: string;
  summary?: string;
  previewAudioUrl?: string | null;
  priceCents: number;
  currency: string;
  language?: string | null;
  gender?: string | null;
  accent?: string | null;
  creatorId: string;
  purchaseCount?: number;
  /** Locked at publish time so cart pricing matches catalog pricing. */
  platformFeeBps?: number;
}

interface Props {
  item: VoiceMarketplaceCardItem;
}

export default function VoiceMarketplaceCard({ item }: Props) {
  const { addItem, items } = useCart();
  const { toggle, isActive } = useAudioPreview();

  const cartId = `voice:${item.voiceCloneId}`;
  const inCart = items.some((i) => i.id === cartId);
  const playing = isActive(item.voiceCloneId);

  const togglePreview = () => {
    void toggle(item.voiceCloneId, item.previewAudioUrl);
  };

  const handleAddToCart = () => {
    addItem({
      id: cartId,
      type: "voice_clone",
      name: item.name,
      price: item.priceCents / 100,
      voiceCloneId: item.voiceCloneId,
      creatorId: item.creatorId,
      platformFeeBps: item.platformFeeBps,
      previewAudioUrl: item.previewAudioUrl ?? undefined,
    });
    toast.success(`${item.name} added to cart`);
  };

  const shareUrl = `${window.location.origin}/marketplace/voices/${item.voiceCloneId}`;

  return (
    <BaseCard className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Mic className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">
                <Link
                  to={`/marketplace/voices/${item.voiceCloneId}`}
                  className="hover:text-primary transition-colors"
                >
                  {item.name}
                </Link>
              </h3>
              <p className="text-xs text-muted-foreground truncate">
                {item.summary || "AI voice"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <WishlistButton
              entityType="voice_clone"
              entityId={item.voiceCloneId}
              className="h-7 w-7"
            />
            <ShareMenu
              variant="icon"
              align="end"
              className="h-7 w-7"
              url={shareUrl}
              title={item.name}
            />
            <span className="font-semibold text-sm tabular-nums">
              {formatPriceCents(item.priceCents, item.currency)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {item.language && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Globe2 className="h-2.5 w-2.5" />
              {item.language}
            </Badge>
          )}
          {item.gender && (
            <Badge variant="outline" className="text-[10px] capitalize">
              {item.gender}
            </Badge>
          )}
          {item.accent && (
            <Badge variant="outline" className="text-[10px] capitalize">
              {item.accent}
            </Badge>
          )}
          {item.purchaseCount && item.purchaseCount > 0 ? (
            <Badge variant="secondary" className="text-[10px]">
              {item.purchaseCount} sold
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={togglePreview}
            disabled={!item.previewAudioUrl}
          >
            {playing ? (
              <>
                <Pause className="h-3.5 w-3.5 mr-1.5" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Preview
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            className="flex-1"
            onClick={handleAddToCart}
            disabled={inCart}
          >
            {inCart ? (
              <>
                <Check className="h-3.5 w-3.5 mr-1.5" />
                In cart
              </>
            ) : (
              <>
                <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
                {item.priceCents === 0 ? "Claim" : "Add"}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </BaseCard>
  );
}
