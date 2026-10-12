/**
 * Segmented ffmpeg.wasm encode against a fake ffmpeg port: frames are
 * chunked into segments, each segment leaves the heap, the mux stitches
 * them with the audio, progress is monotonic, and abort / exec failure
 * surface as AbortError / a coded FfmpegRenderError.
 *
 * Run: vitest run lib/timeline/__tests__/ffmpeg-encode-pipeline.test.ts
 */
import { describe, expect, it, vi } from "vitest";
import { encodeFramesWithFfmpeg } from "../ffmpeg/encode-pipeline";
import { ffmpegEncodingFor } from "../ffmpeg/encode-args";
import type { FFFSMountOptions, FFFSType } from "@ffmpeg/ffmpeg";

// The package resolves to an empty module under node (its "node" export
// condition), so the enum value is spelled out here.
const WORKERFS = "WORKERFS" as FFFSType;
import { adaptFfmpeg, type FfmpegInstance } from "../ffmpeg/ffmpeg-loader";
import { FfmpegRenderError } from "../ffmpeg/errors";

/** A fake @ffmpeg/ffmpeg instance with Emscripten FS semantics that matter
 *  here (mkdir needs the parent and fails on an existing dir; writes need the
 *  parent dir; mount needs an existing mount point; exec inputs must exist),
 *  driven through the REAL adapter so a missing mount-point mkdir fails. */
function fakeFfmpeg(opts: { failExecAt?: number } = {}) {
  const files = new Map<string, Uint8Array | string>();
  const dirs = new Set<string>(["/"]);
  const execs: string[][] = [];
  const mounts: Array<{ mountPoint: string; names: string[] }> = [];
  const mountedFiles = new Set<string>();
  const parentOf = (path: string) => {
    const slash = path.lastIndexOf("/");
    return slash > 0 ? path.slice(0, slash) : "/";
  };
  const instance: FfmpegInstance = {
    writeFile: vi.fn(async (path: string, data: Uint8Array | string) => {
      if (!dirs.has(parentOf(path))) throw new Error(`ENOENT ${path}`);
      files.set(path, data);
      return true;
    }),
    readFile: vi.fn(async (path: string) => {
      const data = files.get(path);
      if (data === undefined) throw new Error(`ENOENT ${path}`);
      return data;
    }),
    deleteFile: vi.fn(async (path: string) => {
      if (!files.delete(path)) throw new Error(`ENOENT ${path}`);
      return true;
    }),
    createDir: vi.fn(async (path: string) => {
      if (!dirs.has(parentOf(path))) throw new Error(`ENOENT ${path}`);
      if (dirs.has(path)) throw new Error(`EEXIST ${path}`);
      dirs.add(path);
      return true;
    }),
    listDir: vi.fn(async (path: string) =>
      [...dirs].filter((d) => d !== "/" && parentOf(d) === path).map((d) => ({ name: d.slice(d.lastIndexOf("/") + 1), isDir: true })),
    ),
    exec: vi.fn(async (args: string[]) => {
      execs.push(args);
      args.forEach((arg, i) => {
        if (args[i - 1] === "-i" && !files.has(arg) && !mountedFiles.has(arg)) throw new Error(`ENOENT input ${arg}`);
      });
      if (opts.failExecAt === execs.length) return 1;
      // The output is the last arg; write a tiny fake encoded file.
      files.set(args[args.length - 1], new Uint8Array([execs.length]));
      return 0;
    }),
    mount: vi.fn(async (_fsType: FFFSType, options: FFFSMountOptions, mountPoint: string) => {
      if (!dirs.has(mountPoint)) throw new Error(`ENOENT mount point ${mountPoint}`);
      const names = (options.blobs ?? []).map((b) => b.name);
      names.forEach((n) => mountedFiles.add(`${mountPoint}/${n}`));
      mounts.push({ mountPoint, names });
      return true;
    }),
    unmount: vi.fn(async (mountPoint: string) => {
      if (!mounts.some((m) => m.mountPoint === mountPoint)) throw new Error(`EINVAL ${mountPoint}`);
      mountedFiles.clear();
      return true;
    }),
    terminate: vi.fn(),
  };
  return Object.assign(adaptFfmpeg(instance, WORKERFS), { instance, files, execs, mounts });
}

const W = 4;
const H = 2;
const frame = () => new Uint8ClampedArray(W * H * 4).fill(7);

describe("encodeFramesWithFfmpeg", () => {
  it("encodes frames in segments, frees each from the heap, and muxes them with the audio", async () => {
    const ffmpeg = fakeFfmpeg();
    const readFrame = vi.fn(async () => frame());
    const progress: number[] = [];
    const encoding = ffmpegEncodingFor("prores", W, H, 30);
    const blob = await encodeFramesWithFfmpeg({
      ffmpeg,
      encoding,
      width: W,
      height: H,
      fps: 30,
      totalFrames: 5,
      readFrame,
      audioWav: new Blob(["wav"]),
      segmentFrames: 2,
      onProgress: (v) => progress.push(v),
    });

    expect(readFrame).toHaveBeenCalledTimes(5);
    expect(readFrame.mock.calls.map((c) => (c as unknown as [number])[0])).toEqual([0, 1, 2, 3, 4]);
    // 3 segment encodes (2 + 2 + 1 frames) + 1 mux.
    expect(ffmpeg.execs).toHaveLength(4);
    const rawWrites = vi.mocked(ffmpeg.instance.writeFile).mock.calls.filter((c) => String(c[0]).endsWith(".rgba"));
    expect(rawWrites.map((c) => (c[1] as Uint8Array).byteLength)).toEqual([2 * W * H * 4, 2 * W * H * 4, W * H * 4]);
    expect(ffmpeg.execs[0]).toContain("prores_ks");
    // Segments + the WAV are mounted read-only for the mux.
    expect(ffmpeg.mounts).toEqual([{ mountPoint: "/segments", names: ["seg_00000.mov", "seg_00001.mov", "seg_00002.mov", "audio.wav"] }]);
    const mux = ffmpeg.execs[3];
    expect(mux).toContain("concat");
    expect(mux).toContain("/segments/audio.wav");
    expect(mux).toContain("pcm_s24le");
    // Only the finished file and the list remain in MEMFS.
    expect([...ffmpeg.files.keys()].sort()).toEqual(["/work/out.mov", "/work/segments.ffconcat"]);
    expect(String(ffmpeg.files.get("/work/segments.ffconcat"))).toContain("file '/segments/seg_00002.mov'");

    // The WORKERFS mount is released once the file is out.
    expect(ffmpeg.instance.unmount).toHaveBeenCalledWith("/segments");

    expect(blob.type).toBe("video/quicktime");
    expect(progress.every((v, i) => i === 0 || v >= progress[i - 1])).toBe(true);
    expect(progress[progress.length - 1]).toBe(0.97);
  });

  it("mounts no audio and maps none for a silent video", async () => {
    const ffmpeg = fakeFfmpeg();
    await encodeFramesWithFfmpeg({
      ffmpeg,
      encoding: ffmpegEncodingFor("dnxhd", W, H, 30),
      width: W,
      height: H,
      fps: 30,
      totalFrames: 1,
      readFrame: async () => frame(),
      audioWav: null,
    });
    expect(ffmpeg.mounts[0].names).toEqual(["seg_00000.mov"]);
    expect(ffmpeg.execs[1]).not.toContain("-c:a");
  });

  it("raises a coded ENCODE_FAILED error when ffmpeg exits non-zero", async () => {
    const ffmpeg = fakeFfmpeg({ failExecAt: 1 });
    const run = encodeFramesWithFfmpeg({
      ffmpeg,
      encoding: ffmpegEncodingFor("prores", W, H, 30),
      width: W,
      height: H,
      fps: 30,
      totalFrames: 3,
      readFrame: async () => frame(),
      audioWav: null,
    });
    await expect(run).rejects.toBeInstanceOf(FfmpegRenderError);
    await expect(run).rejects.toMatchObject({ code: "ENCODE_FAILED" });
  });

  it("creates the mount point before mounting (Emscripten FS.mount needs an existing dir)", async () => {
    const ffmpeg = fakeFfmpeg();
    await encodeFramesWithFfmpeg({
      ffmpeg,
      encoding: ffmpegEncodingFor("prores", W, H, 30),
      width: W,
      height: H,
      fps: 30,
      totalFrames: 1,
      readFrame: async () => frame(),
      audioWav: null,
    });
    expect(ffmpeg.instance.createDir).toHaveBeenCalledWith("/segments");
    expect(ffmpeg.mounts).toHaveLength(1);
  });

  it("tolerates an already-existing mount point", async () => {
    const ffmpeg = fakeFfmpeg();
    await ffmpeg.createDir("/segments");
    await expect(ffmpeg.mountBlobs("/segments", [{ name: "a.mov", data: new Blob(["x"]) }])).resolves.toBeUndefined();
    expect(ffmpeg.mounts).toEqual([{ mountPoint: "/segments", names: ["a.mov"] }]);
  });

  it("rejects when the core lacks WORKERFS instead of failing later", async () => {
    const ffmpeg = fakeFfmpeg();
    vi.mocked(ffmpeg.instance.mount).mockResolvedValueOnce(false);
    await expect(ffmpeg.mountBlobs("/segments", [])).rejects.toThrow(/WORKERFS/);
  });

  it("unmounts even when the mux fails", async () => {
    // 1 segment encode, then the mux (exec #2) fails.
    const ffmpeg = fakeFfmpeg({ failExecAt: 2 });
    const run = encodeFramesWithFfmpeg({
      ffmpeg,
      encoding: ffmpegEncodingFor("prores", W, H, 30),
      width: W,
      height: H,
      fps: 30,
      totalFrames: 1,
      readFrame: async () => frame(),
      audioWav: null,
    });
    await expect(run).rejects.toMatchObject({ code: "ENCODE_FAILED" });
    expect(ffmpeg.instance.unmount).toHaveBeenCalledWith("/segments");
  });

  it("aborts with AbortError and kills the ffmpeg worker", async () => {
    const ffmpeg = fakeFfmpeg();
    const controller = new AbortController();
    const run = encodeFramesWithFfmpeg({
      ffmpeg,
      encoding: ffmpegEncodingFor("prores", W, H, 30),
      width: W,
      height: H,
      fps: 30,
      totalFrames: 10,
      readFrame: async (f) => {
        if (f === 3) controller.abort();
        return frame();
      },
      audioWav: null,
      signal: controller.signal,
      segmentFrames: 2,
    });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(ffmpeg.instance.terminate).toHaveBeenCalled();
    expect(ffmpeg.mounts).toHaveLength(0);
  });

  it("refuses to start when already aborted", async () => {
    const ffmpeg = fakeFfmpeg();
    const controller = new AbortController();
    controller.abort();
    await expect(
      encodeFramesWithFfmpeg({
        ffmpeg,
        encoding: ffmpegEncodingFor("prores", W, H, 30),
        width: W,
        height: H,
        fps: 30,
        totalFrames: 1,
        readFrame: async () => frame(),
        audioWav: null,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(ffmpeg.execs).toHaveLength(0);
  });
});
