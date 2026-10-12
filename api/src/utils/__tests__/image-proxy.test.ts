/**
 * Image proxy rules (utils/image-proxy.ts).
 *
 * Run: node --import tsx --test src/utils/__tests__/image-proxy.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PROXY_REDIRECTS,
  fetchPublicUrl,
  isImageContentType,
  parseProxyTarget,
  readBytesOrStream,
  readCapped,
} from "../image-proxy.js";

describe("parseProxyTarget", () => {
  it("accepts public http(s) image URLs", () => {
    assert.equal(parseProxyTarget("https://images.unsplash.com/photo-1?w=800")?.hostname, "images.unsplash.com");
    assert.ok(parseProxyTarget("http://cdn.example.com/a.png"));
    assert.ok(parseProxyTarget("https://cdn.example.com:443/a.png"));
  });

  it("refuses other schemes, credentials and odd ports", () => {
    for (const raw of ["ftp://x.com/a.png", "data:image/png;base64,AA", "javascript:alert(1)", "https://u:p@x.com/a.png", "https://x.com:8080/a.png", "", null, undefined, "not a url"]) {
      assert.equal(parseProxyTarget(raw as string | null | undefined), null, String(raw));
    }
  });

  it("refuses private, loopback and metadata hosts", () => {
    for (const raw of [
      "http://localhost/a.png",
      "http://127.0.0.1/a.png",
      "http://10.1.2.3/a.png",
      "http://172.20.0.1/a.png",
      "http://192.168.1.1/a.png",
      "http://169.254.169.254/latest/meta-data",
      "http://100.64.0.1/a.png",
      "http://[::1]/a.png",
      "http://[fd00::1]/a.png",
      "http://[::ffff:127.0.0.1]/a.png",
      "http://2130706433/a.png",
      "http://0x7f000001/a.png",
      "http://db.internal/a.png",
      "http://224.0.0.1/a.png",
      "http://239.255.255.250/a.png",
      "http://255.255.255.255/a.png",
      "http://198.18.0.1/a.png",
      "http://198.19.255.254/a.png",
    ]) {
      assert.equal(parseProxyTarget(raw), null, raw);
    }
  });

  it("keeps public neighbours of the newly refused ranges", () => {
    assert.ok(parseProxyTarget("http://198.20.0.1/a.png"));
    assert.ok(parseProxyTarget("http://223.255.0.1/a.png"));
  });

  it("refuses absurdly long input", () => {
    assert.equal(parseProxyTarget(`https://x.com/${"a".repeat(5000)}`), null);
  });
});

describe("isImageContentType", () => {
  it("allows raster images, refuses SVG and non-images", () => {
    assert.equal(isImageContentType("image/png"), true);
    assert.equal(isImageContentType("image/jpeg; charset=binary"), true);
    assert.equal(isImageContentType("image/svg+xml"), false);
    assert.equal(isImageContentType("text/html"), false);
    assert.equal(isImageContentType(null), false);
  });
});

/** A body that arrives in `chunks` with no content-length. */
function chunkedResponse(chunks: Uint8Array[], headers: Record<string, string> = {}): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]!);
      else controller.close();
    },
  });
  return new Response(body, { headers });
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<number> {
  return (await new Response(stream).arrayBuffer()).byteLength;
}

describe("fetchPublicUrl (manual redirects, every hop re-checked)", () => {
  function scripted(routes: Record<string, () => Response>) {
    const calls: Array<{ url: string; redirect: string | undefined }> = [];
    const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, redirect: init?.redirect });
      const route = routes[url];
      return route ? route() : new Response("nope", { status: 404 });
    }) as typeof fetch;
    return { fetchImpl, calls };
  }
  const redirect = (location: string, status = 302) => () => new Response(null, { status, headers: { Location: location } });
  const ok = () => new Response("img", { status: 200, headers: { "content-type": "image/png" } });

  it("returns a direct answer and never lets fetch follow on its own", async () => {
    const { fetchImpl, calls } = scripted({ "https://cdn.example.com/a.png": ok });
    const res = await fetchPublicUrl(new URL("https://cdn.example.com/a.png"), {}, fetchImpl);
    assert.equal(res?.status, 200);
    assert.deepEqual(calls.map((c) => c.redirect), ["manual"]);
  });

  it("follows public hops, resolving a relative Location", async () => {
    const { fetchImpl, calls } = scripted({
      "https://a.example.com/x": redirect("https://b.example.com/y", 301),
      "https://b.example.com/y": redirect("/z.png"),
      "https://b.example.com/z.png": ok,
    });
    const res = await fetchPublicUrl(new URL("https://a.example.com/x"), {}, fetchImpl);
    assert.equal(res?.status, 200);
    assert.deepEqual(calls.map((c) => c.url), ["https://a.example.com/x", "https://b.example.com/y", "https://b.example.com/z.png"]);
  });

  it("refuses a hop to a private / metadata host without fetching it", async () => {
    const { fetchImpl, calls } = scripted({ "https://a.example.com/x": redirect("http://169.254.169.254/latest/meta-data") });
    assert.equal(await fetchPublicUrl(new URL("https://a.example.com/x"), {}, fetchImpl), null);
    assert.equal(calls.length, 1);
  });

  it(`gives up after ${MAX_PROXY_REDIRECTS} redirects`, async () => {
    const routes: Record<string, () => Response> = {};
    for (let i = 0; i < 10; i++) routes[`https://a.example.com/${i}`] = redirect(`https://a.example.com/${i + 1}`);
    const { fetchImpl, calls } = scripted(routes);
    assert.equal(await fetchPublicUrl(new URL("https://a.example.com/0"), {}, fetchImpl), null);
    assert.equal(calls.length, MAX_PROXY_REDIRECTS + 1);
  });

  it("a redirect with no Location is refused", async () => {
    const { fetchImpl } = scripted({ "https://a.example.com/x": () => new Response(null, { status: 302 }) });
    assert.equal(await fetchPublicUrl(new URL("https://a.example.com/x"), {}, fetchImpl), null);
  });
});

describe("readCapped (streaming cap)", () => {
  it("reads a body within the cap", async () => {
    const buf = await readCapped(chunkedResponse([new Uint8Array(3), new Uint8Array(4)]), 10);
    assert.equal(buf?.byteLength, 7);
  });
  it("refuses a declared-too-large body without reading it", async () => {
    assert.equal(await readCapped(new Response(new Uint8Array(5), { headers: { "content-length": "999" } }), 10), null);
  });
  it("refuses an undeclared body once it passes the cap", async () => {
    assert.equal(await readCapped(chunkedResponse([new Uint8Array(6), new Uint8Array(6)]), 10), null);
  });
});

describe("readBytesOrStream", () => {
  it("buffers a small body", async () => {
    const body = await readBytesOrStream(chunkedResponse([new Uint8Array(4)]), 10, 100);
    assert.equal(body?.kind, "bytes");
    assert.equal(body?.kind === "bytes" ? body.bytes.byteLength : -1, 4);
  });
  it("hands an undeclared oversize body back as a stream, prefix included", async () => {
    const body = await readBytesOrStream(chunkedResponse([new Uint8Array(8), new Uint8Array(8), new Uint8Array(8)]), 10, 100);
    assert.equal(body?.kind, "stream");
    if (body?.kind === "stream") assert.equal(await drain(body.stream), 24);
  });
  it("streams a declared-oversize body without buffering it", async () => {
    const res = new Response(new Uint8Array(50), { headers: { "content-length": "50" } });
    const body = await readBytesOrStream(res, 10, 100);
    assert.equal(body?.kind, "stream");
    if (body?.kind === "stream") assert.equal(await drain(body.stream), 50);
  });
  it("refuses a body declared beyond the stream cap", async () => {
    assert.equal(await readBytesOrStream(new Response(new Uint8Array(5), { headers: { "content-length": "500" } }), 10, 100), null);
  });
  it("the stream errors once an undeclared body passes the stream cap", async () => {
    const body = await readBytesOrStream(chunkedResponse(Array.from({ length: 6 }, () => new Uint8Array(30))), 10, 100);
    assert.equal(body?.kind, "stream");
    if (body?.kind === "stream") await assert.rejects(drain(body.stream));
  });
});
