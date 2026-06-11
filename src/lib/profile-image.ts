export type ProfileImageType =
  | { extension: "jpg"; contentType: "image/jpeg" }
  | { extension: "png"; contentType: "image/png" }
  | { extension: "webp"; contentType: "image/webp" };

function hasBytes(bytes: Uint8Array, signature: readonly number[], offset = 0) {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function detectProfileImageType(
  bytes: Uint8Array,
): ProfileImageType | null {
  if (hasBytes(bytes, [0xff, 0xd8, 0xff])) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { extension: "png", contentType: "image/png" };
  }
  if (
    hasBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    hasBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }
  return null;
}

export function profileImageTypeMatches(
  declaredContentType: string,
  detectedType: ProfileImageType,
) {
  return declaredContentType === detectedType.contentType;
}
