/**
 * Tests for the podcast RSS generator (#908). Pins the XML structure
 * Apple Podcasts + Spotify validate against — a future tweak that
 * silently breaks the iTunes namespace or chapter encoding would
 * make every subscribed feed start failing.
 *
 * Uses Node's built-in `node:test` runner to match the other
 * `shared/__tests__/*` files (no vitest dependency on the shared
 * package — `shared` ships zero-dep + builds in both browser and
 * server contexts).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderPodcastRss, type PodcastFeedSpec, type PodcastEpisode } from "../podcast-rss.js";

function spec(): PodcastFeedSpec {
  return {
    title: "Test Show",
    description: "A test description.",
    link: "https://hired.video/podcasts/test",
    imageUrl: "https://hired.video/podcasts/test/cover.png",
    author: "Jamie Test",
    ownerEmail: "jamie@example.com",
    category: "Technology",
    language: "en-us",
    explicit: false,
    feedUrl: "https://hired.video/podcasts/test/feed.xml",
  };
}

function episode(overrides: Partial<PodcastEpisode> = {}): PodcastEpisode {
  return {
    guid: "ep-1",
    title: "Episode 1",
    description: "First episode.",
    audioUrl: "https://hired.video/podcasts/test/ep-1.mp3",
    audioBytes: 12_345_678,
    audioMime: "audio/mpeg",
    durationSec: 1830,
    pubDate: new Date("2026-05-24T12:00:00Z"),
    ...overrides,
  };
}

describe("renderPodcastRss", () => {
  it("emits an XML 1.0 declaration + RSS 2.0 root", () => {
    const xml = renderPodcastRss(spec(), []);
    assert.equal(xml.startsWith('<?xml version="1.0"'), true);
    assert.match(xml, /<rss version="2.0"/);
  });

  it("includes the iTunes + atom + podcast namespaces (required by Apple Podcasts)", () => {
    const xml = renderPodcastRss(spec(), []);
    assert.match(xml, /xmlns:itunes="http:\/\/www\.itunes\.com\/dtds\/podcast-1\.0\.dtd"/);
    assert.match(xml, /xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom"/);
    assert.match(xml, /xmlns:podcast="https:\/\/podcastindex\.org\/namespace\/1\.0"/);
  });

  it("escapes XML entities in titles + descriptions", () => {
    const xml = renderPodcastRss(
      { ...spec(), title: "Test & <Show>", description: "It's a \"test\"" },
      [],
    );
    assert.match(xml, /Test &amp; &lt;Show&gt;/);
    assert.match(xml, /It&apos;s a &quot;test&quot;/);
    assert.equal(xml.includes("Test & <Show>"), false);
  });

  it("renders <enclosure> with url, length, and type per episode", () => {
    const xml = renderPodcastRss(spec(), [episode()]);
    assert.match(
      xml,
      /<enclosure url="https:\/\/hired\.video\/podcasts\/test\/ep-1\.mp3" length="12345678" type="audio\/mpeg"\/>/,
    );
  });

  it("formats duration as HH:MM:SS when at least 1 hour", () => {
    const xml = renderPodcastRss(spec(), [episode({ durationSec: 3725 })]);
    assert.match(xml, /<itunes:duration>1:02:05<\/itunes:duration>/);
  });

  it("formats duration as MM:SS when under 1 hour", () => {
    const xml = renderPodcastRss(spec(), [episode({ durationSec: 125 })]);
    assert.match(xml, /<itunes:duration>02:05<\/itunes:duration>/);
  });

  it("emits itunes:season + itunes:episode when supplied", () => {
    const xml = renderPodcastRss(spec(), [episode({ season: 2, episodeNumber: 5 })]);
    assert.match(xml, /<itunes:season>2<\/itunes:season>/);
    assert.match(xml, /<itunes:episode>5<\/itunes:episode>/);
  });

  it("embeds Podcast 2.0 chapter data when chapters are supplied", () => {
    const xml = renderPodcastRss(spec(), [
      episode({
        chapters: [
          { startTimeSec: 0, title: "Intro" },
          { startTimeSec: 60, title: "Body" },
        ],
      }),
    ]);
    assert.match(xml, /<podcast:chapters/);
    assert.match(xml, /data:application\/json%2Bchapters|data:application\/json\+chapters/);
    assert.match(xml, /Intro/);
    assert.match(xml, /Body/);
  });

  it("nests itunes:category over subcategory when subcategory is supplied", () => {
    const xml = renderPodcastRss(
      { ...spec(), category: "Technology", subcategory: "Tech News" },
      [],
    );
    assert.match(xml, /<itunes:category text="Technology">/);
    assert.match(xml, /<itunes:category text="Tech News"\/>/);
  });

  it("renders pubDate in RFC-822 format", () => {
    const xml = renderPodcastRss(spec(), [episode({ pubDate: new Date("2026-05-24T12:00:00Z") })]);
    assert.match(
      xml,
      /<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT<\/pubDate>/,
    );
  });
});
