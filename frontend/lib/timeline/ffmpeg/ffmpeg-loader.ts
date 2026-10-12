/**
 * Lazy ffmpeg.wasm loader + port. Nothing here is imported until a ProRes /
 * DNxHD (or other ffmpeg-routed) export starts: the render facade
 * dynamic-imports `ffmpeg-render.ts`, which dynamic-imports this module's
 * `@ffmpeg/ffmpeg` dependency.
 *
 * Hosting: the core (~32 MB wasm) is fetched from jsdelivr — the CDN the
 * app already loads its other wasm engines from — and handed to ffmpeg as
 * same-origin blob: URLs (the documented pattern). It can't ship from
 * /public: Cloudflare Pages caps a single asset at 25 MB. The small
 * `@ffmpeg/ffmpeg` class + worker are bundled by Vite (excluded from
 * optimizeDeps so its worker URL resolves).
 *
 * Build choice: the multithreaded core (`@ffmpeg/core-mt`) needs
 * SharedArrayBuffer, i.e. a cross-origin-isolated page. The app is NOT
 * isolated (site-wide COOP/COEP blocked every third-party iframe —
 * Turnstile, YouTube embeds, OAuth popups), so the single-thread core
 * (`@ffmpeg/core`, same encoders + WORKERFS) is the default and core-mt is
 * used only when the page happens to be isolated.
 */
import { FfmpegRenderError } from "./errors";
import { probeEncoders } from "./encoder-probe";

const CORE_VERSION = "0.12.10";
const coreBase = (pkg: "core" | "core-mt") => `https://cdn.jsdelivr.net/npm/@ffmpeg/${pkg}@${CORE_VERSION}/dist/esm`;

/** The slice of ffmpeg the encode pipeline uses — keeps the library behind
 *  one adapter so the pipeline is unit-testable with a fake. */
export interface FfmpegPort {
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  deleteFile(path: string): Promise<void>;
  createDir(path: string): Promise<void>;
  /** Returns ffmpeg's exit code (0 = ok, 1 = timeout or error). */
  exec(args: string[], timeoutMs?: number): Promise<number>;
  /** Mount Blobs read-only at `mountPoint` (WORKERFS — read lazily, never
   *  copied into the wasm heap). Creates the mount-point directory first:
   *  Emscripten's FS.mount requires it to exist (ENOENT otherwise). */
  mountBlobs(mountPoint: string, blobs: Array<{ name: string; data: Blob }>): Promise<void>;
  unmount(mountPoint: string): Promise<void>;
  /** Kill the ffmpeg worker (frees the whole wasm heap; rejects in-flight calls). */
  terminate(): void;
}

/** The multithreaded core can run in this page (cross-origin isolated). */
export function canUseThreadedCore(): boolean {
  if (typeof crossOriginIsolated === "undefined" || !crossOriginIsolated) return false;
  return typeof SharedArrayBuffer !== "undefined";
}

interface CoreUrls {
  coreURL: string;
  wasmURL: string;
  /** Only the multithreaded core has a pthread worker. */
  workerURL?: string;
}

let coreUrls: Promise<CoreUrls> | null = null;

/** Fetch the core once per page session; retry on the next export if it failed. */
function loadCoreUrls(toBlobURL: (url: string, mime: string) => Promise<string>): Promise<CoreUrls> {
  coreUrls ??= canUseThreadedCore()
    ? Promise.all([
        toBlobURL(`${coreBase("core-mt")}/ffmpeg-core.js`, "text/javascript"),
        toBlobURL(`${coreBase("core-mt")}/ffmpeg-core.wasm`, "application/wasm"),
        toBlobURL(`${coreBase("core-mt")}/ffmpeg-core.worker.js`, "text/javascript"),
      ]).then(([coreURL, wasmURL, workerURL]) => ({ coreURL, wasmURL, workerURL }))
    : Promise.all([
        toBlobURL(`${coreBase("core")}/ffmpeg-core.js`, "text/javascript"),
        toBlobURL(`${coreBase("core")}/ffmpeg-core.wasm`, "application/wasm"),
      ]).then(([coreURL, wasmURL]) => ({ coreURL, wasmURL }));
  coreUrls.catch(() => {
    coreUrls = null;
  });
  return coreUrls;
}

/** The FFmpeg-class surface the adapter drives (structural, so tests can
 *  pass a fake instance and exercise the real adapter). */
export type FfmpegInstance = Pick<
  import("@ffmpeg/ffmpeg").FFmpeg,
  "writeFile" | "readFile" | "deleteFile" | "createDir" | "listDir" | "exec" | "mount" | "unmount" | "terminate"
>;

/** mkdir that tolerates an existing directory. The worker reports FS errors
 *  as a plain string (errno is lost), so "exists" is confirmed via listDir of
 *  the parent rather than by parsing the message. */
async function ensureDir(instance: FfmpegInstance, path: string): Promise<void> {
  try {
    await instance.createDir(path);
  } catch (err) {
    const slash = path.lastIndexOf("/");
    const parent = slash > 0 ? path.slice(0, slash) : "/";
    const name = path.slice(slash + 1);
    const entries = await instance.listDir(parent);
    if (!entries.some((e) => e.name === name && e.isDir)) throw err;
  }
}

/** Wrap an @ffmpeg/ffmpeg 0.12 instance as the port. `workerFs` is
 *  `FFFSType.WORKERFS` (passed in so this module keeps the library lazy). */
export function adaptFfmpeg(instance: FfmpegInstance, workerFs: import("@ffmpeg/ffmpeg").FFFSType): FfmpegPort {
  return {
    async writeFile(path, data) {
      await instance.writeFile(path, data);
    },
    async readFile(path) {
      const data = await instance.readFile(path);
      return typeof data === "string" ? new TextEncoder().encode(data) : data;
    },
    async deleteFile(path) {
      await instance.deleteFile(path);
    },
    async createDir(path) {
      await instance.createDir(path);
    },
    exec: (args, timeoutMs) => instance.exec(args, timeoutMs),
    async mountBlobs(mountPoint, blobs) {
      await ensureDir(instance, mountPoint);
      // The worker answers `false` (not an error) when the core lacks the
      // filesystem — surface it instead of failing later with ENOENT.
      const mounted = await instance.mount(workerFs, { blobs }, mountPoint);
      if (!mounted) throw new Error(`ffmpeg core has no ${workerFs}; cannot mount ${mountPoint}`);
    },
    async unmount(mountPoint) {
      await instance.unmount(mountPoint);
    },
    terminate: () => instance.terminate(),
  };
}

/** Load a fresh ffmpeg instance (one per render — terminate() frees its heap). */
export async function loadFfmpeg(): Promise<FfmpegPort> {
  let ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg | null = null;
  try {
    const [{ FFmpeg, FFFSType }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
    const urls = await loadCoreUrls(toBlobURL);
    let instance = new FFmpeg();
    ffmpeg = instance;
    await instance.load(urls);
    // Once per page session: which encoders this core ships (encoder-probe).
    if ((await probeEncoders(instance)) === "timeout") {
      // A core that sat on `-encoders` for the whole timeout is in unknown
      // health: drop it and export on a fresh one (the list stays unknown).
      instance.terminate();
      instance = new FFmpeg();
      ffmpeg = instance;
      await instance.load(urls);
    }
    return adaptFfmpeg(instance, FFFSType.WORKERFS);
  } catch (err) {
    ffmpeg?.terminate();
    throw new FfmpegRenderError("LOAD_FAILED", {}, { cause: err });
  }
}
