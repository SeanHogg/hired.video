// ─── YouTube iframe params (shared by eager + flat) ──────────────────────────
// Single source of truth for the embed URL. Without `playlist=<videoId>`
// the `loop=1` flag is silently ignored by the YouTube player — fixing
// that latent bug here means every consumer (hero spotlight, public
// watch page) loops correctly when they ask for looping.


export function youtubeEmbedUrl(
  videoId: string,
  opts: { autoplay?: boolean; muted?: boolean; controls?: boolean; loop?: boolean },
): string {
  const params = new URLSearchParams({
    autoplay: opts.autoplay ? "1" : "0",
    mute: opts.muted ? "1" : "0",
    controls: opts.controls === false ? "0" : "1",
    modestbranding: "1",
    playsinline: "1",
    rel: "0",
    ...(opts.loop ? { loop: "1", playlist: videoId } : {}),
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}
