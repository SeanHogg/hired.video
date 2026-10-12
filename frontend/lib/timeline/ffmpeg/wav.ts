/**
 * AudioBuffer → 32-bit float WAV Blob — how the timeline's audio mix (the
 * same `renderTimelineAudio` buffer the WebCodecs engine encodes to AAC)
 * reaches ffmpeg.wasm, which re-encodes it to PCM (MOV) or AAC (MP4).
 */
import { audioBufferToInterleaved } from "../audio-mixer";

const WAVE_FORMAT_IEEE_FLOAT = 3;
const HEADER_BYTES = 44;

export function audioBufferToWav(buf: AudioBuffer): Blob {
  const samples = audioBufferToInterleaved(buf);
  const channels = buf.numberOfChannels;
  const bytesPerSample = 4;
  const dataBytes = samples.length * bytesPerSample;
  const header = new DataView(new ArrayBuffer(HEADER_BYTES));
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) header.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  header.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, WAVE_FORMAT_IEEE_FLOAT, true);
  header.setUint16(22, channels, true);
  header.setUint32(24, buf.sampleRate, true);
  header.setUint32(28, buf.sampleRate * channels * bytesPerSample, true);
  header.setUint16(32, channels * bytesPerSample, true);
  header.setUint16(34, bytesPerSample * 8, true);
  ascii(36, "data");
  header.setUint32(40, dataBytes, true);
  return new Blob([header.buffer, samples.buffer], { type: "audio/wav" });
}
