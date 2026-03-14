import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";

// ============================================================================
// CONSTANTS
// ============================================================================

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
].join(" ");

// ============================================================================
// ROUTES
// ============================================================================

export const youtubeRoutes = new Hono<{ Variables: Variables }>();

/**
 * GET /api/youtube/company/status
 *
 * Reports whether the company YouTube integration is active by attempting to
 * refresh the stored OAuth token. Returns channel info on success.
 */
youtubeRoutes.get("/company/status", async (c) => {
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_REFRESH_TOKEN) {
    return c.json(
      success({
        connected: false,
        reason: "YouTube integration is not configured",
      }),
    );
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET ?? "",
        refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenResponse.ok) {
      return c.json(
        success({
          connected: false,
          reason: "Failed to refresh YouTube access token — credentials may be invalid or revoked",
        }),
      );
    }

    const { access_token } = (await tokenResponse.json()) as { access_token: string };

    // Fetch the authenticated channel info
    const channelResponse = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      {
        headers: { Authorization: `Bearer ${access_token}` },
      },
    );

    if (!channelResponse.ok) {
      return c.json(
        success({
          connected: false,
          reason: "Could not retrieve channel information",
        }),
      );
    }

    const channelData = (await channelResponse.json()) as {
      items?: Array<{
        id: string;
        snippet: { title: string; description: string; thumbnails?: { default?: { url: string } } };
      }>;
    };

    const channel = channelData.items?.[0];
    if (!channel) {
      return c.json(
        success({
          connected: false,
          reason: "No YouTube channel found for the connected account",
        }),
      );
    }

    return c.json(
      success({
        connected: true,
        channel: {
          id: channel.id,
          title: channel.snippet.title,
          description: channel.snippet.description,
          thumbnailUrl: channel.snippet.thumbnails?.default?.url,
        },
      }),
    );
  } catch (err) {
    console.error("[youtube/company/status]", err);
    return c.json(error("YOUTUBE_ERROR", "Failed to check YouTube connection status"), 502);
  }
});

/**
 * GET /api/youtube/company/auth-url
 *
 * Returns the Google OAuth2 authorisation URL an admin should visit to
 * connect the company YouTube account. The resulting auth code / refresh
 * token must be stored as the YOUTUBE_REFRESH_TOKEN secret.
 */
youtubeRoutes.get("/company/auth-url", (c) => {
  if (!process.env.YOUTUBE_CLIENT_ID) {
    return c.json(error("CONFIGURATION_ERROR", "YOUTUBE_CLIENT_ID is not configured"), 500);
  }

  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID,
    redirect_uri: "urn:ietf:wg:oauth:2.0:oob", // out-of-band for manual token capture
    response_type: "code",
    scope: YOUTUBE_SCOPES,
    access_type: "offline",
    prompt: "consent",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return c.json(
    success({
      authUrl,
      instructions:
        "Visit the authUrl in a browser, grant access, then store the returned code via `wrangler secret put YOUTUBE_REFRESH_TOKEN`",
    }),
  );
});
