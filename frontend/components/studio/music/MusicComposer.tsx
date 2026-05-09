// MusicComposer.tsx — single entry point for the Studio "Original
// Music" panel. Tabs between two production paradigms:
//
//   Step Sequencer  → grid-programmed beats + bass + melody
//   Piano           → played live, captured + rendered to WAV
//
// Both tabs hand the parent the same `(blob, durationSec)` callback,
// so StudioActions doesn't care which surface produced the music.

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OriginalMusicComposer from "@/components/studio/OriginalMusicComposer";
import PianoComposer from "@/components/studio/music/PianoComposer";

interface Props {
  onMusicReady?: (blob: Blob, durationSec: number) => void;
}

export default function MusicComposer({ onMusicReady }: Props) {
  return (
    <Tabs defaultValue="sequencer" className="w-full">
      <TabsList className="mb-3">
        <TabsTrigger value="sequencer">Step sequencer</TabsTrigger>
        <TabsTrigger value="piano">Piano</TabsTrigger>
      </TabsList>
      <TabsContent value="sequencer" className="mt-0">
        <OriginalMusicComposer onMusicReady={onMusicReady} />
      </TabsContent>
      <TabsContent value="piano" className="mt-0">
        <PianoComposer onMusicReady={onMusicReady} />
      </TabsContent>
    </Tabs>
  );
}
