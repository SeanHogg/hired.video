/**
 * ScrollTracker — Wistia-style engagement tracking for static artifacts
 * (resume, article, profile, job, company, service). Plays the same role
 * `VideoTracker` plays for video: per-bucket engagement array + drop-off +
 * 30s periodic flush + beforeunload beacon.
 *
 * Bucketing: 100 fixed buckets representing scroll-depth percentage. As
 * the viewport scrolls past each 1% threshold, the corresponding bucket
 * flips 0→1. The `engagementUnit: '%'` flag tells the backend (and the
 * shared <MetricsPanel>) that this is a scroll-depth, not a time, axis.
 *
 * Single seam per artifact kind: callers do
 *
 *   useEffect(() => {
 *     const tracker = new ScrollTracker({ artifactKind: "resume", artifactId });
 *     return tracker.attach(scrollRoot);   // or `document.documentElement`
 *   }, [artifactId]);
 *
 * and the artifact's drawer Metrics section automatically shows a real
 * scroll-depth heatmap.
 */

import type { ArtifactKind } from "../../../shared/artifact-views";
import { sendArtifactViewBeacon } from "../services/artifact-view-service";

const BUCKETS = 100;
const FLUSH_INTERVAL_MS = 30_000;

interface ScrollTrackerOptions {
  artifactKind: ArtifactKind;
  artifactId: string;
  /** Optional override of the scroll root. Defaults to the page (window). */
  scrollRoot?: HTMLElement | null;
}

export class ScrollTracker {
  private artifactKind: ArtifactKind;
  private artifactId: string;
  private buckets: number[] = new Array(BUCKETS).fill(0);
  private highestBucket: number = 0;
  private startTime: number = 0;
  private sent: boolean = false;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(options: ScrollTrackerOptions) {
    this.artifactKind = options.artifactKind;
    this.artifactId = options.artifactId;
  }

  /** Attach to the document (or a given scroll root). Returns cleanup. */
  attach(scrollRoot?: HTMLElement | null): () => void {
    this.startTime = Date.now();

    const onScroll = () => {
      const pct = computeScrollPercent(scrollRoot ?? null);
      if (pct <= this.highestBucket) return;
      // Fill every bucket from highest+1 up to the new pct. This stays
      // monotonic even if the user reverses scroll direction.
      for (let i = this.highestBucket + 1; i <= pct && i < BUCKETS; i++) {
        this.buckets[i] = 1;
      }
      this.highestBucket = Math.min(pct, BUCKETS - 1);
    };

    // Seed with the initial viewport position (some artifacts render the
    // user already mid-page after a fragment link).
    onScroll();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    this.interval = setInterval(() => this.send(), FLUSH_INTERVAL_MS);

    const onBeforeUnload = () => this.send();
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onBeforeUnload);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onBeforeUnload);
      if (this.interval) clearInterval(this.interval);
      this.send();
    };
  }

  private send(): void {
    if (this.sent) return;
    if (this.highestBucket === 0) return;

    const dwellSec = Math.round((Date.now() - this.startTime) / 1000);
    const reached = this.buckets.filter((b) => b === 1).length;
    const percentConsumed = reached / BUCKETS;
    // Drop-off bucket = first 0 after the start of engagement.
    let dropOffBucket: number | null = null;
    for (let i = 1; i < BUCKETS; i++) {
      if (this.buckets[i] === 0 && this.buckets[i - 1] === 1) {
        dropOffBucket = i;
        break;
      }
    }

    sendArtifactViewBeacon({
      artifactKind: this.artifactKind,
      artifactId: this.artifactId,
      engagement: this.buckets,
      totalEngagementSec: dwellSec,
      percentConsumed,
      dropOffBucket,
      referrer: document.referrer || null,
    }).catch(() => {
      // Telemetry must never break a page load.
    });

    this.sent = true;
  }
}

/** Compute current scroll percentage (0..99) for either window or a
 *  given scroll root. Floored so each pct maps to a distinct bucket. */
function computeScrollPercent(root: HTMLElement | null): number {
  if (root) {
    const max = Math.max(1, root.scrollHeight - root.clientHeight);
    return Math.min(99, Math.floor((root.scrollTop / max) * 100));
  }
  const doc = document.documentElement;
  const max = Math.max(1, doc.scrollHeight - doc.clientHeight);
  return Math.min(99, Math.floor((window.scrollY / max) * 100));
}
