import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PhotonImage } from "@cf-wasm/photon";
import { applyOrientation, process, readJpegOrientation } from "./processing-provider";

test("processing emits WebP gallery derivatives and a JPEG moderation derivative", async () => {
  // A real 2x2 PNG fixture. The processing provider must normalize every
  // allowed upload format into bytes Rekognition accepts for moderation.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMQ0bAR0bBhgFAADI4B4aUR2lQAAAAASUVORK5CYII=",
    "base64",
  );
  const result = await process(Uint8Array.from(png));

  assert.equal(Buffer.from(result.displayBytes.subarray(0, 4)).toString("ascii"), "RIFF");
  assert.equal(Buffer.from(result.thumbnailBytes.subarray(0, 4)).toString("ascii"), "RIFF");
  assert.deepEqual(Array.from(result.moderationBytes.subarray(0, 3)), [0xff, 0xd8, 0xff]);
});

// Builds a minimal, synthetic JPEG containing only what readJpegOrientation
// needs to find: SOI, one APP1 segment with a one-entry EXIF IFD holding the
// Orientation tag, then SOS. Not a decodable image — this function never
// reads past the header segments it's scanning for, so no real compressed
// image data is needed to test it in isolation.
function buildExifOrientationJpeg(orientation: number): Uint8Array {
  const content: number[] = [];
  content.push(0x45, 0x78, 0x69, 0x66, 0x00, 0x00); // "Exif\0\0"
  content.push(0x49, 0x49); // "II" — little-endian TIFF byte order
  content.push(0x2a, 0x00); // TIFF magic number 42, little-endian
  content.push(0x08, 0x00, 0x00, 0x00); // offset to first IFD (8, relative to "II")
  content.push(0x01, 0x00); // IFD entry count = 1
  content.push(0x12, 0x01); // tag 0x0112 (Orientation), little-endian
  content.push(0x03, 0x00); // type 3 (SHORT), little-endian
  content.push(0x01, 0x00, 0x00, 0x00); // component count = 1
  content.push(orientation & 0xff, (orientation >> 8) & 0xff, 0x00, 0x00); // value + padding
  content.push(0x00, 0x00, 0x00, 0x00); // next IFD offset = 0 (none)

  const segmentLength = content.length + 2; // JPEG segment length includes its own 2 length bytes
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe1, (segmentLength >> 8) & 0xff, segmentLength & 0xff, // APP1 marker + length
    ...content,
    0xff, 0xda, // SOS — parser stops scanning here
  ]);
}

test("readJpegOrientation returns 1 for non-JPEG bytes", () => {
  assert.equal(readJpegOrientation(new Uint8Array([0, 1, 2, 3])), 1);
});

test("readJpegOrientation returns 1 for a JPEG with no EXIF segment at all", () => {
  assert.equal(readJpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda])), 1);
});

test("readJpegOrientation falls back to 1 for an out-of-range orientation value", () => {
  assert.equal(readJpegOrientation(buildExifOrientationJpeg(9)), 1);
});

for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
  test(`readJpegOrientation reads orientation ${orientation} from its synthetic EXIF segment`, () => {
    assert.equal(readJpegOrientation(buildExifOrientationJpeg(orientation)), orientation);
  });
}

// A tiny, genuinely rectangular (non-square) RGBA image built directly from
// raw pixels — sidesteps needing a real, decodable JPEG/PNG fixture just to
// prove rotation/flip actually happened. 4 wide x 2 tall, with a unique
// marker color at the top-left pixel (0,0) and black everywhere else, so a
// transform's effect on that one pixel's position is unambiguous.
const MARKER_WIDTH = 4;
const MARKER_HEIGHT = 2;

function buildMarkerImage(): PhotonImage {
  const pixels = new Uint8Array(MARKER_WIDTH * MARKER_HEIGHT * 4);
  // Top-left pixel (0,0) = opaque red; every other pixel stays transparent black.
  pixels[0] = 255; // R
  pixels[3] = 255; // A
  return new PhotonImage(pixels, MARKER_WIDTH, MARKER_HEIGHT);
}

function redPixelIndex(image: PhotonImage): number {
  const pixels = image.get_raw_pixels();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] === 255 && pixels[i + 1] === 0 && pixels[i + 2] === 0 && pixels[i + 3] === 255) return i / 4;
  }
  throw new Error("marker pixel not found after transform");
}

test("applyOrientation leaves a dimension-preserving orientation's size unchanged (1: no transform)", () => {
  const image = buildMarkerImage();
  const result = applyOrientation(image, 1);
  try {
    assert.equal(result.get_width(), MARKER_WIDTH);
    assert.equal(result.get_height(), MARKER_HEIGHT);
    assert.equal(redPixelIndex(result), 0); // still top-left
  } finally {
    result.free();
  }
});

test("applyOrientation rotates 90 degrees clockwise, moving (0,0) to the new top-right (orientation 6)", () => {
  const image = buildMarkerImage();
  const result = applyOrientation(image, 6);
  try {
    assert.equal(result.get_width(), MARKER_HEIGHT);
    assert.equal(result.get_height(), MARKER_WIDTH);
    // A 90-degree clockwise rotation maps original (x,y) to new
    // (H-1-y, x) in the now-swapped W'xH' image. For (0,0) with H=2,
    // that's new position (1,0) — flat index 1 in a 2-wide image.
    assert.equal(redPixelIndex(result), 1);
  } finally {
    result.free();
  }
});

test("applyOrientation rotates 270 degrees clockwise, moving (0,0) to the new bottom-left (orientation 8)", () => {
  const image = buildMarkerImage();
  const result = applyOrientation(image, 8);
  try {
    assert.equal(result.get_width(), MARKER_HEIGHT);
    assert.equal(result.get_height(), MARKER_WIDTH);
    // A 270-degree clockwise (= 90-degree counterclockwise) rotation maps
    // original (x,y) to new (y, W-1-x). For (0,0) with W=4, that's new
    // position (0,3) — flat index 3*2+0=6 in a 2-wide, 4-tall image.
    assert.equal(redPixelIndex(result), 6);
  } finally {
    result.free();
  }
});

test("applyOrientation's 90-degree and 270-degree rotations move the marker pixel to different positions", () => {
  // Regardless of which absolute direction photon-rs treats as "clockwise"
  // for a positive-degree rotate() call, 90 and 270 degrees must not land
  // the same reference pixel in the same spot — that would mean one of the
  // two orientation cases is silently wrong (e.g. both mapped to the same
  // rotation direction).
  const rotated90 = applyOrientation(buildMarkerImage(), 6);
  const rotated270 = applyOrientation(buildMarkerImage(), 8);
  try {
    assert.notEqual(redPixelIndex(rotated90), redPixelIndex(rotated270));
  } finally {
    rotated90.free();
    rotated270.free();
  }
});

test("applyOrientation flips horizontally without changing dimensions (orientation 2)", () => {
  const image = buildMarkerImage();
  const result = applyOrientation(image, 2);
  try {
    assert.equal(result.get_width(), MARKER_WIDTH);
    assert.equal(result.get_height(), MARKER_HEIGHT);
    // A horizontal flip of row 0 moves column 0 to column (width-1), same row.
    assert.equal(redPixelIndex(result), MARKER_WIDTH - 1);
  } finally {
    result.free();
  }
});

test("applyOrientation flips vertically without changing dimensions (orientation 4)", () => {
  const image = buildMarkerImage();
  const result = applyOrientation(image, 4);
  try {
    assert.equal(result.get_width(), MARKER_WIDTH);
    assert.equal(result.get_height(), MARKER_HEIGHT);
    // A vertical flip of column 0 moves row 0 to row (height-1), same column.
    assert.equal(redPixelIndex(result), (MARKER_HEIGHT - 1) * MARKER_WIDTH);
  } finally {
    result.free();
  }
});

test("applyOrientation rotates 180 degrees without changing dimensions (orientation 3)", () => {
  const image = buildMarkerImage();
  const result = applyOrientation(image, 3);
  try {
    assert.equal(result.get_width(), MARKER_WIDTH);
    assert.equal(result.get_height(), MARKER_HEIGHT);
    // 180 degrees moves (0,0) to the diagonally-opposite corner.
    assert.equal(redPixelIndex(result), MARKER_WIDTH * MARKER_HEIGHT - 1);
  } finally {
    result.free();
  }
});
