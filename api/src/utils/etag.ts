import type { MiddlewareHandler } from "hono";

/**
 * Conditional-GET (ETag / 304) middleware.
 *
 * Hashes the JSON response body, attaches it as a weak ETag, and short-
 * circuits with a 304 Not Modified when the request's `If-None-Match`
 * already holds the same hash. Bodies still hit the database — we don't
 * cache the response — but we save the wire-cost of resending an
 * unchanged 1–5 MB JSON payload on every poll.
 *
 * Designed for list-shaped GET responses: jobs, applications, resumes,
 * pipeline, dashboards. NOT for streaming endpoints, byte ranges, or
 * anything that already has its own cache validator.
 *
 * Composes with `cacheMiddleware` — `max-age` short-circuits inside the
 * window; ETag short-circuits after the window when the body hasn't
 * actually changed.
 */
export function etagMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (c.req.method !== "GET" || c.res.status !== 200) return;

    // Pull the rendered body out of the response Hono just built, hash
    // it, attach the validator, swap the response for 304 when the
    // client already holds this version. Cloning is the cheapest way to
    // keep the original response intact for the success path.
    const cloned = c.res.clone();
    const buf = await cloned.arrayBuffer();
    if (buf.byteLength === 0) return;

    const hash = await sha1Hex(buf);
    const etag = `W/"${hash}"`;
    c.header("ETag", etag);

    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      // Preserve any Cache-Control header the cache middleware set so
      // the browser keeps its freshness window across the 304.
      const cc = c.res.headers.get("Cache-Control");
      const newHeaders = new Headers();
      newHeaders.set("ETag", etag);
      if (cc) newHeaders.set("Cache-Control", cc);
      c.res = new Response(null, { status: 304, headers: newHeaders });
    }
  };
}

async function sha1Hex(buf: ArrayBuffer): Promise<string> {
  // Workers + modern browsers expose SubtleCrypto with SHA-1; collision-
  // resistance isn't a security requirement here, only stability across
  // identical bodies, so SHA-1 is fine and is the shortest digest with
  // broad support.
  const digest = await crypto.subtle.digest("SHA-1", buf);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}
