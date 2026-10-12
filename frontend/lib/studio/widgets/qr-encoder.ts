/**
 * QR encoding for the export's interaction fallback (#2312). The encoder
 * (`uqr`, ~8 KB gzip) is a lazy chunk: `loadQrEncoder` imports it only
 * when an export needs a QR (`withExportTarget`), so neither the main
 * bundle nor the editor / watch page ever load it.
 *
 * The painters are synchronous, so `cachedQrMatrix` answers from the
 * loaded encoder (null until it is) and memoises each payload — every
 * frame of a CTA's window encodes its URL once.
 */
type EncodeQr = typeof import("uqr").encode;

let encodeQr: EncodeQr | null = null;
let loading: Promise<void> | null = null;
const matrices = new Map<string, boolean[][] | null>();

/** Load the encoder once. A failed load leaves the export text-only. */
export function loadQrEncoder(): Promise<void> {
  loading ??= import("uqr")
    .then((mod) => {
      encodeQr = mod.encode;
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

/** The module matrix (`true` = dark, no quiet zone) for `text`, or null
 *  when the encoder isn't loaded or the payload is too long to encode. */
export function cachedQrMatrix(text: string): boolean[][] | null {
  if (!encodeQr || !text) return null;
  let matrix = matrices.get(text);
  if (matrix === undefined) {
    try {
      // ECC "M" survives a video's compression blur better than the default "L".
      matrix = encodeQr(text, { ecc: "M", border: 0 }).data;
    } catch {
      matrix = null;
    }
    matrices.set(text, matrix);
  }
  return matrix;
}
