// Public detail page for a single voice clone listing. Powers shared
// `/marketplace/voices/:voiceCloneId` links — works for unauthenticated
// viewers via the `/api/studio/voice-clones/public/:id` endpoint (whitelisted
// in app.ts PUBLIC_PREFIXES, server-side paywall-gated for free creators
// per #314). Returns the SAFE projection only — no sampleAudioUrl —  so
// nothing here can leak the raw reference audio.
//
// Page chrome composed from `<MarketplaceItemShell/>` to match the
// resume-template marketplace (#700/#761). All share affordances route
// through the platform-wide `buildShareAction` helper.

import { useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  Check,
  Globe2,
  Loader2,
  Mic,
  Pause,
  Play,
  Share2,
  ShoppingCart,
} from "lucide-react";

import MarketplaceItemShell from "@/components/marketplace/MarketplaceItemShell";
import BaseCard from "@/components/ui/BaseCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { useCart } from "@/lib/cart-context";
import { buildShareAction } from "@/lib/card-share-action";
import { useUgcSeo } from "@/lib/seo-ugc";
import { toast } from "sonner";

interface VoiceCloneDetail {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  previewAudioUrl: string | null;
  priceCents: number;
  currency: string;
  language: string | null;
  gender: string | null;
  accent: string | null;
  purchaseCount: number;
  platformFeeBps: number | null;
}

function formatPrice(cents: number, currency: string): string {
  if (cents === 0) return "Free";
  const major = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(major);
}

function VoiceSEO({ clone }: { clone: VoiceCloneDetail }) {
  useUgcSeo("voiceClone", {
    id: clone.id,
    name: clone.name,
    description: clone.description,
    language: clone.language,
    priceCents: clone.priceCents,
    currency: clone.currency,
  });
  return null;
}

export default function VoicePublicDetail() {
  const { voiceCloneId } = useParams<{ voiceCloneId: string }>();
  const [clone, setClone] = useState<VoiceCloneDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const { addItem, items } = useCart();

  useEffect(() => {
    if (!voiceCloneId) return;
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<VoiceCloneDetail>(
        `/api/studio/voice-clones/public/${encodeURIComponent(voiceCloneId)}`,
        undefined,
        { suppressErrorEvent: true },
      )
      .then((res) => {
        if (cancelled) return;
        if (!res.data) {
          setNotFound(true);
        } else {
          setClone(res.data);
        }
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, [voiceCloneId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !clone) {
    return <Navigate to="/search?category=voices" replace />;
  }

  const cartId = `voice:${clone.id}`;
  const inCart = items.some((i) => i.id === cartId);
  const shareAction = buildShareAction({
    entityUrl: `/marketplace/voices/${clone.id}`,
    copySuccessDescription: "Voice listing link has been copied to your clipboard.",
  });

  const togglePreview = () => {
    if (!clone.previewAudioUrl) {
      toast.message("This voice has no preview yet.");
      return;
    }
    if (!audioRef.current) {
      audioRef.current = new Audio(clone.previewAudioUrl);
      audioRef.current.onended = () => setPlaying(false);
      audioRef.current.onerror = () => {
        setPlaying(false);
        toast.error("Couldn't load preview.");
      };
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => setPlaying(false));
      setPlaying(true);
    }
  };

  const handleAddToCart = () => {
    addItem({
      id: cartId,
      type: "voice_clone",
      name: clone.name,
      price: clone.priceCents / 100,
      voiceCloneId: clone.id,
      creatorId: clone.userId,
      platformFeeBps: clone.platformFeeBps ?? undefined,
      previewAudioUrl: clone.previewAudioUrl ?? undefined,
    });
    toast.success(`${clone.name} added to cart`);
  };

  const badges = (
    <>
      <Badge variant="outline" className="text-xs">
        <Mic className="h-3 w-3 mr-1" /> Voice
      </Badge>
      {clone.language && (
        <Badge variant="outline" className="text-xs gap-1">
          <Globe2 className="h-3 w-3" /> {clone.language}
        </Badge>
      )}
      {clone.gender && (
        <Badge variant="outline" className="capitalize">
          {clone.gender}
        </Badge>
      )}
      {clone.accent && (
        <Badge variant="outline" className="capitalize">
          {clone.accent}
        </Badge>
      )}
      {clone.purchaseCount > 0 && (
        <Badge variant="secondary">{clone.purchaseCount} sold</Badge>
      )}
    </>
  );

  const actions = (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Share voice"
        onClick={(e) => shareAction.onClick(e)}
        className="gap-2"
      >
        <Share2 className="h-4 w-4" />
        Share
      </Button>
      <span className="font-semibold tabular-nums">
        {formatPrice(clone.priceCents, clone.currency)}
      </span>
      <Button size="sm" onClick={handleAddToCart} disabled={inCart} className="gap-2">
        {inCart ? (
          <>
            <Check className="h-4 w-4" /> In cart
          </>
        ) : (
          <>
            <ShoppingCart className="h-4 w-4" />
            {clone.priceCents === 0 ? "Claim" : "Add to cart"}
          </>
        )}
      </Button>
    </>
  );

  return (
    <MarketplaceItemShell
      seo={<VoiceSEO clone={clone} />}
      badges={badges}
      actions={actions}
      preview={
        <div className="px-4 sm:px-6 py-8 space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
              <span className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Mic className="h-6 w-6 text-primary" />
              </span>
              {clone.name}
            </h1>
            {clone.description && (
              <p className="text-base text-muted-foreground pt-2">
                {clone.description}
              </p>
            )}
          </div>

          <BaseCard hover={false}>
            <CardContent className="pt-6 space-y-4">
              <h2 className="font-semibold">Preview</h2>
              <Button
                type="button"
                variant="outline"
                onClick={togglePreview}
                disabled={!clone.previewAudioUrl}
                className="gap-2"
              >
                {playing ? (
                  <>
                    <Pause className="h-4 w-4" /> Pause preview
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" /> Play preview
                  </>
                )}
              </Button>
              {!clone.previewAudioUrl && (
                <p className="text-xs text-muted-foreground">
                  The creator hasn't uploaded a preview yet.
                </p>
              )}
            </CardContent>
          </BaseCard>

          <BaseCard hover={false}>
            <CardContent className="pt-6 space-y-3">
              <h2 className="font-semibold">How it works</h2>
              <p className="text-sm text-muted-foreground">
                Voice clones power the in-studio voiceover feature. Buy this
                voice once and use it across every video project — the cloning
                model runs client-side via WebGPU TTS engines, so there are no
                per-call API costs.
              </p>
            </CardContent>
          </BaseCard>
        </div>
      }
    />
  );
}
