// Inlined 16-bit PCM WAV encoder. Standard Microsoft WAVE-PCM header
// followed by interleaved Int16 samples per the RIFF spec. Used by
// every in-Studio music surface that needs to hand a Blob to the
// audio mix (OriginalMusicComposer step sequencer, PianoComposer,
// future render-to-bounce flows). Single source — no second copy.

export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numCh * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLen = buffer.length * blockAlign;
  const out = new ArrayBuffer(44 + dataLen);
  const view = new DataView(out);

  let p = 0;
  function writeStr(s: string) { for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i)); }
  function u32(v: number) { view.setUint32(p, v, true); p += 4; }
  function u16(v: number) { view.setUint16(p, v, true); p += 2; }

  writeStr("RIFF");
  u32(36 + dataLen);
  writeStr("WAVE");
  writeStr("fmt ");
  u32(16);            // fmt chunk size
  u16(1);             // PCM
  u16(numCh);
  u32(sampleRate);
  u32(byteRate);
  u16(blockAlign);
  u16(bitDepth);
  writeStr("data");
  u32(dataLen);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      p += 2;
    }
  }
  return out;
}
