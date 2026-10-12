/**
 * publishProjectVideo — the ORDER of checks (ownership → render → channel cap
 * → connection → publish → record) and the error-kind mapping, with every
 * collaborator stubbed. The db stub answers the project lookup, then the
 * video lookup (requireCompiledVideo), in statement order.
 *
 * Run: node --import tsx --test src/services/social/__tests__/publish-project-video.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  publishProjectVideo,
  PublishProjectVideoError,
  type PublishProjectVideoDeps,
} from "../publish-project-video.js";
import { SocialPublishError, type SocialVideoPublisher } from "../publishers/types.js";
import { VIDEO_PUBLISH_PLATFORMS, type VideoPublishPlatform } from "../../../../../shared/social-platforms.js";

const OWNER = "8f2c1a9e-4b7d-4e21-9c3a-1d5e6f7a8b9c";
const PROJECT = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const VIDEO = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";

/** Chainable Drizzle stand-in: every builder call returns itself; awaiting
 *  resolves the next queued row set. */
function dbReturning(...rowSets: unknown[][]) {
  const queue = [...rowSets];
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "innerJoin", "where", "limit"]) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve(queue.shift() ?? []);
  return chain as unknown as NonNullable<PublishProjectVideoDeps["db"]>;
}

const project = { id: PROJECT, userId: OWNER, companyId: null, videoId: VIDEO };
const video = { id: VIDEO, userId: OWNER, r2Key: "videos/abc.mp4" };

/** Every platform gets an adapter running `impl` (tagged with its own id). */
function publisher(impl: SocialVideoPublisher["publish"]): Record<VideoPublishPlatform, SocialVideoPublisher> {
  return Object.fromEntries(VIDEO_PUBLISH_PLATFORMS.map((platform) => [platform, { platform, publish: impl }])) as Record<
    VideoPublishPlatform,
    SocialVideoPublisher
  >;
}

const input = {
  actor: { userId: OWNER, isGuest: false },
  projectId: PROJECT,
  platform: "tiktok" as const,
  title: "Dana — video resume",
  caption: "hello",
  env: undefined,
};

async function expectKind(promise: Promise<unknown>, kind: string) {
  await assert.rejects(promise, (e: unknown) => e instanceof PublishProjectVideoError && e.kind === kind);
}

describe("publishProjectVideo", () => {
  it("404s a missing project before anything else runs", async () => {
    let touched = false;
    await expectKind(
      publishProjectVideo(input, { db: dbReturning([]), canPost: async () => ((touched = true), true) }),
      "PROJECT_NOT_FOUND",
    );
    assert.equal(touched, false);
  });

  it("refuses an unrendered project", async () => {
    await expectKind(
      publishProjectVideo(input, { db: dbReturning([{ ...project, videoId: null }]) }),
      "VIDEO_NOT_READY",
    );
  });

  it("checks the channel cap before asking for a token", async () => {
    let askedForToken = false;
    await expectKind(
      publishProjectVideo(input, {
        db: dbReturning([project], [video]),
        canPost: async () => false,
        getAccessToken: async () => ((askedForToken = true), "tok"),
      }),
      "CHANNEL_LIMIT",
    );
    assert.equal(askedForToken, false);
  });

  it("asks the user to connect when there is no token", async () => {
    await expectKind(
      publishProjectVideo(input, {
        db: dbReturning([project], [video]),
        canPost: async () => true,
        getAccessToken: async () => null,
      }),
      "NOT_CONNECTED",
    );
  });

  it("maps a rejected token to NOT_CONNECTED and an unsupported account through", async () => {
    const base = { canPost: async () => true, getAccessToken: async () => "tok" };
    await expectKind(
      publishProjectVideo(input, {
        ...base,
        db: dbReturning([project], [video]),
        publishers: publisher(async () => {
          throw new SocialPublishError("NOT_AUTHORIZED", "expired");
        }),
      }),
      "NOT_CONNECTED",
    );
    await expectKind(
      publishProjectVideo(input, {
        ...base,
        db: dbReturning([project], [video]),
        publishers: publisher(async () => {
          throw new SocialPublishError("ACCOUNT_UNSUPPORTED", "no page");
        }),
      }),
      "ACCOUNT_UNSUPPORTED",
    );
  });

  it("publishes with the CDN URL and records one publication under the platform id", async () => {
    let recorded: unknown = null;
    let sentUrl = "";
    const record = await publishProjectVideo(input, {
      db: dbReturning([project], [video]),
      canPost: async () => true,
      getAccessToken: async () => "tok",
      publishers: publisher(async (req) => {
        sentUrl = req.video.url;
        return { externalId: "777", externalUrl: "https://www.tiktok.com/@dana/video/777" };
      }),
      record: (async (row: unknown) => {
        recorded = row;
        return { destination: "tiktok" };
      }) as unknown as PublishProjectVideoDeps["record"],
    });
    assert.match(sentUrl, /videos\/abc\.mp4$/);
    assert.deepEqual(recorded, {
      projectId: PROJECT,
      destination: "tiktok",
      externalId: "777",
      externalUrl: "https://www.tiktok.com/@dana/video/777",
      status: "published",
      renderVariantId: null,
      publishedBy: OWNER,
    });
    assert.deepEqual(record, { destination: "tiktok" });
  });

  it("posts LinkedIn through the same path: cap, token and record all keyed by the linkedin id", async () => {
    const seen: { capDestination?: string; tokenPlatform?: string; adapter?: string; recorded?: unknown } = {};
    const adapters = publisher(async () => {
      throw new Error("wrong adapter");
    });
    adapters.linkedin = {
      platform: "linkedin",
      publish: async (req) => {
        seen.adapter = `linkedin:${req.accessToken}:${req.caption}`;
        return { externalId: "urn:li:share:42", externalUrl: "https://www.linkedin.com/feed/update/urn:li:share:42" };
      },
    };
    await publishProjectVideo(
      { ...input, platform: "linkedin" },
      {
        db: dbReturning([project], [video]),
        canPost: async ({ destination }) => ((seen.capDestination = destination), true),
        getAccessToken: async (_userId, platform) => ((seen.tokenPlatform = platform), "li-tok"),
        publishers: adapters,
        record: (async (row: unknown) => {
          seen.recorded = row;
          return { destination: "linkedin" };
        }) as unknown as PublishProjectVideoDeps["record"],
      },
    );
    assert.equal(seen.capDestination, "linkedin");
    assert.equal(seen.tokenPlatform, "linkedin");
    assert.equal(seen.adapter, "linkedin:li-tok:hello");
    assert.deepEqual(seen.recorded, {
      projectId: PROJECT,
      destination: "linkedin",
      externalId: "urn:li:share:42",
      externalUrl: "https://www.linkedin.com/feed/update/urn:li:share:42",
      status: "published",
      renderVariantId: null,
      publishedBy: OWNER,
    });
  });

  it("counts LinkedIn against the channel cap like every other network", async () => {
    let posted = false;
    await expectKind(
      publishProjectVideo(
        { ...input, platform: "linkedin" },
        {
          db: dbReturning([project], [video]),
          canPost: async () => false,
          getAccessToken: async () => "li-tok",
          publishers: publisher(async () => ((posted = true), { externalId: "x", externalUrl: null })),
        },
      ),
      "CHANNEL_LIMIT",
    );
    assert.equal(posted, false);
  });

  it("posts YouTube through the same seam: settings reach the adapter, the upload lands on the video row (#2044)", async () => {
    const seen: { youtube?: unknown; linked?: unknown; recorded?: unknown; tokenPlatform?: string } = {};
    const adapters = publisher(async () => {
      throw new Error("wrong adapter");
    });
    adapters.youtube = {
      platform: "youtube",
      publish: async (req) => {
        seen.youtube = req.youtube;
        return { externalId: "dQw4w9WgXcQ", externalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" };
      },
    };
    await publishProjectVideo(
      { ...input, platform: "youtube", youtube: { privacy: "unlisted", shorts: true } },
      {
        db: dbReturning([project], [video]),
        canPost: async () => true,
        getAccessToken: async (_userId, platform) => ((seen.tokenPlatform = platform), "yt-tok"),
        publishers: adapters,
        linkYouTube: (async (_db: unknown, videoId: string, upload: unknown) => {
          seen.linked = { videoId, upload };
        }) as unknown as PublishProjectVideoDeps["linkYouTube"],
        record: (async (row: unknown) => {
          seen.recorded = row;
          return { destination: "youtube" };
        }) as unknown as PublishProjectVideoDeps["record"],
      },
    );
    assert.equal(seen.tokenPlatform, "youtube");
    assert.deepEqual(seen.youtube, { privacy: "unlisted", shorts: true });
    assert.deepEqual(seen.linked, {
      videoId: VIDEO,
      upload: { externalId: "dQw4w9WgXcQ", externalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    });
    assert.deepEqual(seen.recorded, {
      projectId: PROJECT,
      destination: "youtube",
      externalId: "dQw4w9WgXcQ",
      externalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      status: "published",
      renderVariantId: null,
      publishedBy: OWNER,
    });
  });

  it("never links a non-YouTube post onto the video row", async () => {
    let linked = false;
    await publishProjectVideo(input, {
      db: dbReturning([project], [video]),
      canPost: async () => true,
      getAccessToken: async () => "tok",
      publishers: publisher(async () => ({ externalId: "777", externalUrl: null })),
      linkYouTube: (async () => {
        linked = true;
      }) as unknown as PublishProjectVideoDeps["linkYouTube"],
      record: (async () => ({ destination: "tiktok" })) as unknown as PublishProjectVideoDeps["record"],
    });
    assert.equal(linked, false);
  });
});

describe("publishProjectVideo — fitted cuts (#2045)", () => {
  const OTHER_PROJECT = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
  const CUT = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
  const VARIANT = "6f7a8b9c-0d1e-4f2a-9b3c-4d5e6f7a8b9c";
  const cutVideo = { id: CUT, userId: OWNER, r2Key: `studio/${OWNER}/${PROJECT}/variants/9x16-full-1760000000000.mp4` };
  const cutRow = {
    id: VARIANT,
    projectId: PROJECT,
    variantKey: "9x16-full",
    contentRevision: "v2-1k9x3f-4c.b",
    videoId: CUT,
    r2Key: cutVideo.r2Key,
    branded: true,
  };

  it("rejects a cut that belongs to another project before anything is posted (error case)", async () => {
    let posted = false;
    let askedForToken = false;
    // The real lookup runs: the (video, project) pair matches no variant row.
    await expectKind(
      publishProjectVideo(
        { ...input, platform: "instagram", variantVideoId: CUT },
        {
          db: dbReturning([project], []),
          canPost: async () => true,
          getAccessToken: async () => ((askedForToken = true), "tok"),
          publishers: publisher(async () => ((posted = true), { externalId: "x", externalUrl: null })),
        },
      ),
      "INVALID_VARIANT",
    );
    assert.equal(posted, false);
    assert.equal(askedForToken, false);
  });

  it("asks for the cut scoped to the project being posted", async () => {
    let asked: unknown = null;
    await expectKind(
      publishProjectVideo(
        { ...input, projectId: OTHER_PROJECT, variantVideoId: CUT },
        {
          db: dbReturning([{ ...project, id: OTHER_PROJECT }]),
          resolveVariant: async (_db, args) => ((asked = args), null),
        },
      ),
      "INVALID_VARIANT",
    );
    assert.deepEqual(asked, { projectId: OTHER_PROJECT, videoId: CUT });
  });

  it("posts the cut's file, records the cut on the publication and links YouTube to the master", async () => {
    const seen: { url?: string; recorded?: unknown; linked?: string } = {};
    await publishProjectVideo(
      { ...input, platform: "youtube", youtube: { privacy: "public", shorts: true }, variantVideoId: CUT },
      {
        db: dbReturning([project], [cutVideo]),
        resolveVariant: async () => cutRow,
        canPost: async () => true,
        getAccessToken: async () => "yt-tok",
        publishers: publisher(async (req) => {
          seen.url = req.video.url;
          return { externalId: "abc123", externalUrl: "https://www.youtube.com/shorts/abc123" };
        }),
        linkYouTube: (async (_db: unknown, videoId: string) => {
          seen.linked = videoId;
        }) as unknown as PublishProjectVideoDeps["linkYouTube"],
        record: (async (row: unknown) => {
          seen.recorded = row;
          return { destination: "youtube" };
        }) as unknown as PublishProjectVideoDeps["record"],
      },
    );
    assert.match(seen.url ?? "", /variants\/9x16-full-1760000000000\.mp4$/);
    assert.equal(seen.linked, VIDEO);
    assert.deepEqual(seen.recorded, {
      projectId: PROJECT,
      destination: "youtube",
      externalId: "abc123",
      externalUrl: "https://www.youtube.com/shorts/abc123",
      status: "published",
      renderVariantId: VARIANT,
      publishedBy: OWNER,
    });
  });
});
