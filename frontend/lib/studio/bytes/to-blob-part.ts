/**
 * Convert a `Uint8Array` (or any `ArrayBufferView`) into a `BlobPart`
 * accepted by the `Blob` constructor under the newer DOM typings that
 * distinguish `ArrayBuffer` from `SharedArrayBuffer`.
 *
 * Background: TypeScript 5.7's lib.dom typings narrowed `ArrayBufferView`'s
 * generic `buffer` to `ArrayBuffer | SharedArrayBuffer`. Passing a raw
 * `Uint8Array` directly to `new Blob([...])` now errors because the
 * constructor's `BlobPart` shape is `ArrayBufferView<ArrayBuffer>`.
 *
 * The fix is to re-wrap the bytes as a sliced ArrayBuffer, which the
 * constructor accepts unconditionally. The slice copies the bytes — for
 * encoder outputs (a few MB) that's negligible.
 *
 * Per the DRY rule this lives ONCE so every encoder routes through the
 * same conversion (animation-export, comic-export, cad-pdf-encoder, and
 * any future bytes-to-blob path).
 */

export function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
