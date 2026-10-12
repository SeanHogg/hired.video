/**
 * The multi-track audio timeline's mutators: one selected layer at a time,
 * per-bar change, split, remove, music drop (stock id or a custom
 * `{url,label,durationSeconds}` source) and the drag-end commit that makes
 * a multi-tick drag one undo step.
 */
import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { findMusicTrack } from "@/lib/studio/music-catalog";
import type { AudioPatch } from "./editor-types";
import type { DragPayload } from "./drag-protocol";
import {
  type AudioLayer,
  type CanvasState,
  addAudioLayer,
  makeAudioLayer,
  removeAudioLayer,
  splitAudioLayer,
  updateAudioLayer,
} from "./canvas-state";

export function useAudioLayers(
  setState: Dispatch<SetStateAction<CanvasState>>,
  commitHistory: () => void,
) {
  const { t } = useTranslation();
  const { toast } = useToast();
  // Audio timeline — the multi-track model. One selected layer id at a
  // time; the per-bar change handler routes through `updateAudioLayer`,
  // split/remove through their mutators. Commit fires on drag-end so a
  // multi-tick drag becomes one undo step.
  const [selectedAudioLayerId, setSelectedAudioLayerId] = useState<string | null>(null);
  const handleAudioLayerChange = useCallback(
    (
      layerId: string,
      patch: AudioPatch,
    ) => {
      setState((prev) => updateAudioLayer(prev, layerId, patch));
    },
    [setState],
  );
  const handleSplitAudioLayer = useCallback(
    (layerId: string, atCompositionSec: number) => {
      setState((prev) => {
        const { state: next, newLayerId } = splitAudioLayer(prev, layerId, atCompositionSec);
        if (newLayerId) setSelectedAudioLayerId(newLayerId);
        return next;
      });
      commitHistory();
    },
    [setState, commitHistory],
  );
  const handleRemoveAudioLayer = useCallback(
    (layerId: string) => {
      setState((prev) => removeAudioLayer(prev, layerId));
      setSelectedAudioLayerId((cur) => (cur === layerId ? null : cur));
      commitHistory();
    },
    [setState, commitHistory],
  );
  // A music track dragged onto the timeline / canvas → append a music
  // layer. Payload data is EITHER a stock catalog track id OR a
  // JSON-encoded custom source `{url,label,durationSeconds}` (uploaded /
  // composed music dragged from the bin), so both stock and custom music
  // get drag-to-add parity.
  const handleMusicDrop = useCallback(
    (payload: DragPayload) => {
      if (payload.kind !== "music") return;
      let layer: AudioLayer | null = null;
      if (payload.data.startsWith("{")) {
        try {
          const custom = JSON.parse(payload.data) as {
            url?: string;
            label?: string;
            durationSeconds?: number;
          };
          if (custom.url) {
            layer = makeAudioLayer({
              kind: "music",
              source: { kind: "custom", url: custom.url },
              label: custom.label || "Music",
              durationSeconds: custom.durationSeconds ?? 0,
            });
          }
        } catch {
          // Malformed payload — ignore the drop.
        }
      } else {
        const track = findMusicTrack(payload.data);
        if (track && track.id !== "none") {
          layer = makeAudioLayer({
            kind: "music",
            source: { kind: "stock", trackId: track.id },
            label: track.label,
            durationSeconds: track.durationSeconds,
          });
        }
      }
      if (!layer) return;
      const added = layer;
      setState((prev) => addAudioLayer(prev, added));
      setSelectedAudioLayerId(added.id);
      commitHistory();
      toast({ title: t("studio.editor.musicToast", { label: added.label }) });
    },
    [setState, commitHistory, toast, t],
  );
  const handleAudioCommit = useCallback(() => {
    // The history wrapper's `commit` records the current state as one
    // undo step. The drag emitted many setState calls during the drag;
    // they coalesced into the live state but didn't push a history
    // entry. Calling commit() at the end captures the final snapshot.
    commitHistory();
  }, [commitHistory]);

  return {
    selectedAudioLayerId,
    setSelectedAudioLayerId,
    handleAudioLayerChange,
    handleSplitAudioLayer,
    handleRemoveAudioLayer,
    handleMusicDrop,
    handleAudioCommit,
  };
}
