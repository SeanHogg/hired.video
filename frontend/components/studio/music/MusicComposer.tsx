// MusicComposer.tsx — single entry point for the Studio "Original
// Music" panel. Tabs between three production paradigms:
//
//   Step Sequencer  → grid-programmed beats + bass + melody
//   Piano           → quick single-timbre keyboard, captured to WAV
//   Synth           → full sound mixer (multi-osc stack + filter rack +
//                     effect rack + master + presets) played live
//
// All three tabs hand the parent the same `(blob, durationSec)` callback,
// so StudioActions doesn't care which surface produced the music.

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OriginalMusicComposer from "@/components/studio/OriginalMusicComposer";
import PianoComposer from "@/components/studio/music/PianoComposer";
import SynthComposer from "@/components/studio/music/SynthComposer";

interface Props {
  onMusicReady?: (blob: Blob, durationSec: number) => void;
}

export default function MusicComposer({ onMusicReady }: Props) {
  return (
    <Tabs defaultValue="sequencer" className="w-full">
      <TabsList className="mb-3">
        <TabsTrigger value="sequencer">Step sequencer</TabsTrigger>
        <TabsTrigger value="piano">Piano</TabsTrigger>
        <TabsTrigger value="synth">Synth</TabsTrigger>
      </TabsList>
      <TabsContent value="sequencer" className="mt-0">
        <OriginalMusicComposer onMusicReady={onMusicReady} />
      </TabsContent>
      <TabsContent value="piano" className="mt-0">
        <PianoComposer onMusicReady={onMusicReady} />
      </TabsContent>
      <TabsContent value="synth" className="mt-0">
        <SynthComposer onMusicReady={onMusicReady} />
      </TabsContent>
    </Tabs>
  );
}
