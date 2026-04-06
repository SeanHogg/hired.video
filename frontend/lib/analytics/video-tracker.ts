/**
 * Video Engagement Tracker — Wistia-quality per-second tracking.
 *
 * Attach to a <video> element to capture:
 *   - Per-second viewing data (which seconds were watched)
 *   - Total watch time
 *   - Drop-off point
 *   - Sends beacon on page unload
 */

import { trackVideoView } from "../services/studio-features-service";

export class VideoTracker {
  private videoId: string;
  private viewerId?: string;
  private viewerEmail?: string;
  private videoDuration: number = 0;
  private secondsWatched: number[] = [];
  private lastSecond: number = -1;
  private startTime: number = 0;
  private totalWatchTimeSec: number = 0;
  private sent: boolean = false;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    videoId: string,
    options?: { viewerId?: string; viewerEmail?: string },
  ) {
    this.videoId = videoId;
    this.viewerId = options?.viewerId;
    this.viewerEmail = options?.viewerEmail;
  }

  /**
   * Attach to a video element and begin tracking.
   */
  attach(videoEl: HTMLVideoElement): () => void {
    this.startTime = Date.now();

    const onLoadedMetadata = () => {
      this.videoDuration = Math.ceil(videoEl.duration);
      this.secondsWatched = new Array(this.videoDuration).fill(0);
    };

    const onTimeUpdate = () => {
      const currentSecond = Math.floor(videoEl.currentTime);
      if (currentSecond !== this.lastSecond && currentSecond < this.secondsWatched.length) {
        this.secondsWatched[currentSecond] = 1;
        this.lastSecond = currentSecond;
      }
    };

    const onPause = () => {
      this.totalWatchTimeSec = Math.round((Date.now() - this.startTime) / 1000);
    };

    const onEnded = () => {
      this.totalWatchTimeSec = Math.round((Date.now() - this.startTime) / 1000);
      this.send();
    };

    videoEl.addEventListener("loadedmetadata", onLoadedMetadata);
    videoEl.addEventListener("timeupdate", onTimeUpdate);
    videoEl.addEventListener("pause", onPause);
    videoEl.addEventListener("ended", onEnded);

    // Send data periodically (every 30s) in case user navigates away
    this.interval = setInterval(() => {
      this.totalWatchTimeSec = Math.round((Date.now() - this.startTime) / 1000);
      this.send();
    }, 30_000);

    // Send on page unload
    const onBeforeUnload = () => {
      this.totalWatchTimeSec = Math.round((Date.now() - this.startTime) / 1000);
      this.send();
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    // Return cleanup function
    return () => {
      videoEl.removeEventListener("loadedmetadata", onLoadedMetadata);
      videoEl.removeEventListener("timeupdate", onTimeUpdate);
      videoEl.removeEventListener("pause", onPause);
      videoEl.removeEventListener("ended", onEnded);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (this.interval) clearInterval(this.interval);
      this.send();
    };
  }

  /**
   * Send the tracking data to the API.
   */
  private send(): void {
    if (this.sent || this.secondsWatched.length === 0) return;

    const watchedCount = this.secondsWatched.filter((s) => s === 1).length;
    const percentWatched = this.videoDuration > 0
      ? Math.round((watchedCount / this.videoDuration) * 100)
      : 0;

    // Find drop-off: last contiguous watched second from the start
    let dropOffSecond: number | undefined;
    for (let i = 0; i < this.secondsWatched.length; i++) {
      if (this.secondsWatched[i] === 0 && i > 0) {
        dropOffSecond = i;
        break;
      }
    }

    trackVideoView({
      videoId: this.videoId,
      viewerId: this.viewerId,
      viewerEmail: this.viewerEmail,
      secondsWatched: this.secondsWatched,
      totalWatchTimeSec: this.totalWatchTimeSec,
      percentWatched,
      dropOffSecond,
      referrer: document.referrer || undefined,
    }).catch(() => {
      // Silently fail — analytics should never break the user experience
    });

    this.sent = true;
  }
}
