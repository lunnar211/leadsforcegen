import sharp from "sharp";

// Payment-proof hardening: never store or serve the bytes a buyer
// uploaded. Every proof image is decoded to pixels and re-encoded as a
// brand-new JPEG before storage, and re-encoded again on admin preview
// (so even legacy rows uploaded before this change never reach the
// admin's browser in original form).
//
// What re-encoding destroys:
// - Polyglots: a valid image header with an appended script/executable
//   (or data after IEND/EOI) — the decoder reads pixels only, and the
//   output is freshly encoded from those pixels. Appended bytes are
//   simply never copied.
// - Malicious EXIF/metadata: sharp drops all metadata unless
//   withMetadata() is called, which we never do. rotate() applies the
//   EXIF orientation to the pixels first, so phone photos still show
//   upright without carrying the EXIF itself.
// - Steganographic/crafted chunks: only decoded pixel values survive.
//
// What it rejects: anything the decoder cannot fully read (truncated,
// corrupt, or header-only fake images) throws, and callers must reject
// the upload — undecodable bytes are never stored.
//
// Decompression-bomb guard: a small file can decode to gigapixels
// (e.g. a highly compressed PNG). limitInputPixels caps decoded size
// at 25 MP — far above any phone screenshot (~3 MP) — and throws above
// it. failOn "error" (the default, set explicitly) rejects truncated
// or corrupt streams instead of silently serving partial pixels.
const MAX_DECODED_PIXELS = 25_000_000;

export async function reencodeProof(
  bytes: Uint8Array,
): Promise<{ bytes: Buffer; contentType: "image/jpeg" }> {
  const out = await sharp(bytes, {
    failOn: "error",
    limitInputPixels: MAX_DECODED_PIXELS,
  })
    .rotate()
    .jpeg({ quality: 90 })
    .toBuffer();
  return { bytes: out, contentType: "image/jpeg" };
}
