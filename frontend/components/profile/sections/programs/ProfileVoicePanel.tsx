// Public-profile Voice tab — public voice clones authored by this user.
// Reuses VoiceMarketplaceCard so the row UX (preview play, add-to-cart)
// matches the global marketplace at `/marketplace/voices`.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import VoiceMarketplaceCard, {
  type VoiceMarketplaceCardItem,
} from "@/components/VoiceMarketplaceCard";
import {
  getVoiceClonesByCreator,
  type VoiceCloneMarketplaceItem,
} from "@/lib/services/studio-features-service";
import EmptyProgramState from "./EmptyProgramState";

interface Props {
  userId: string;
  isOwner: boolean;
}

function toCardItem(v: VoiceCloneMarketplaceItem): VoiceMarketplaceCardItem {
  return {
    id: v.id,
    voiceCloneId: v.id,
    name: v.name,
    summary: v.description ?? undefined,
    previewAudioUrl: v.previewAudioUrl,
    priceCents: v.priceCents,
    currency: v.currency,
    language: v.language,
    gender: v.gender,
    accent: v.accent,
    creatorId: v.creatorId,
    purchaseCount: v.purchaseCount,
  };
}

export default function ProfileVoicePanel({ userId, isOwner }: Props) {
  const [items, setItems] = useState<VoiceCloneMarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getVoiceClonesByCreator(userId)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading voices…
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return <EmptyProgramState program="voice" isOwner={isOwner} />;
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {items.map((v) => (
        <VoiceMarketplaceCard key={v.id} item={toCardItem(v)} />
      ))}
    </div>
  );
}
