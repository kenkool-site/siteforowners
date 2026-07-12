import assert from "node:assert/strict";
import test from "node:test";
import type { ValidatedEstimatePhoto } from "@/lib/validation/estimate-photos";
import {
  ESTIMATE_PHOTO_BUCKET,
  ESTIMATE_PHOTO_LINK_SECONDS,
  createEstimatePhotoLinks,
  estimatePhotoPath,
  uploadEstimatePhotos,
} from "./estimate-storage";

type UploadCall = {
  bucket: string;
  path: string;
  bytes: Uint8Array;
  contentType: string;
  upsert: boolean;
};

type SignedUrlCall = {
  bucket: string;
  path: string;
  expiresIn: number;
};

function photo(
  extension: "jpg" | "png" | "webp",
  bytes: Uint8Array = Uint8Array.from([0xff, 0xd8, 0xff]),
): ValidatedEstimatePhoto {
  const contentType =
    extension === "jpg"
      ? { extension: "jpg" as const, contentType: "image/jpeg" as const }
      : extension === "png"
        ? { extension: "png" as const, contentType: "image/png" as const }
        : { extension: "webp" as const, contentType: "image/webp" as const };

  return {
    bytes,
    contentType,
    extension,
    sizeBytes: bytes.length,
  };
}

function createFakeSupabase(options?: {
  failUploadIndices?: Set<number>;
  failSignPaths?: Set<string>;
}) {
  const uploadCalls: UploadCall[] = [];
  const signedUrlCalls: SignedUrlCall[] = [];
  let uploadIndex = 0;

  const storage = {
    from(bucket: string) {
      return {
        async upload(
          path: string,
          bytes: Uint8Array,
          opts: { contentType: string; upsert: boolean },
        ) {
          const index = uploadIndex++;
          uploadCalls.push({
            bucket,
            path,
            bytes,
            contentType: opts.contentType,
            upsert: opts.upsert,
          });

          if (options?.failUploadIndices?.has(index)) {
            return { error: { message: "upload failed" } };
          }

          return { error: null };
        },
        async createSignedUrl(path: string, expiresIn: number) {
          signedUrlCalls.push({ bucket, path, expiresIn });

          if (options?.failSignPaths?.has(path)) {
            return { data: null, error: { message: "sign failed" } };
          }

          return {
            data: { signedUrl: `https://signed.example/${path}` },
            error: null,
          };
        },
      };
    },
  };

  return {
    client: { storage },
    uploadCalls,
    signedUrlCalls,
  };
}

test("estimatePhotoPath builds tenant-scoped storage paths", () => {
  assert.equal(
    estimatePhotoPath("tenant-1", "request-1", "photo-1", "webp"),
    "tenant-1/request-1/photo-1.webp",
  );
});

test("uploadEstimatePhotos returns DB rows for successful uploads", async () => {
  const fake = createFakeSupabase();
  const photos = [photo("jpg"), photo("png")];

  const result = await uploadEstimatePhotos(
    fake.client as never,
    "tenant-1",
    "request-1",
    photos,
  );

  assert.equal(result.failedIndices.length, 0);
  assert.equal(result.uploaded.length, 2);

  for (const row of result.uploaded) {
    assert.equal(row.tenant_id, "tenant-1");
    assert.equal(row.estimate_request_id, "request-1");
    assert.match(row.storage_path, /^tenant-1\/request-1\/[0-9a-f-]+\.(jpg|png)$/);
    assert.equal(row.size_bytes, 3);
  }

  assert.equal(fake.uploadCalls.length, 2);
  assert.equal(fake.uploadCalls[0].bucket, ESTIMATE_PHOTO_BUCKET);
  assert.equal(fake.uploadCalls[0].contentType, "image/jpeg");
  assert.equal(fake.uploadCalls[0].upsert, false);
  assert.equal(fake.uploadCalls[1].contentType, "image/png");
});

test("uploadEstimatePhotos records failed indices without dropping successes", async () => {
  const fake = createFakeSupabase({ failUploadIndices: new Set([1]) });
  const photos = [photo("jpg"), photo("webp"), photo("png")];

  const result = await uploadEstimatePhotos(
    fake.client as never,
    "tenant-1",
    "request-1",
    photos,
  );

  assert.deepEqual(result.failedIndices, [1]);
  assert.equal(result.uploaded.length, 2);
  assert.equal(result.uploaded[0].content_type, "image/jpeg");
  assert.equal(result.uploaded[1].content_type, "image/png");
});

test("uploadEstimatePhotos never uses original filenames in storage paths", async () => {
  const fake = createFakeSupabase();
  const suspiciousNames = ["my-kitchen.jpg", "backyard photo.png", "roof%20shot.webp"];

  await uploadEstimatePhotos(
    fake.client as never,
    "tenant-1",
    "request-1",
    suspiciousNames.map((name) => {
      const extension = name.endsWith(".png")
        ? "png"
        : name.endsWith(".webp")
          ? "webp"
          : "jpg";
      return photo(extension);
    }),
  );

  for (const call of fake.uploadCalls) {
    for (const name of suspiciousNames) {
      assert.ok(!call.path.includes(name));
      assert.ok(!call.path.includes(encodeURIComponent(name)));
    }
    assert.match(call.path, /^tenant-1\/request-1\/[0-9a-f-]+\.(jpg|png|webp)$/);
  }
});

test("createEstimatePhotoLinks signs paths for 14 days", async () => {
  const fake = createFakeSupabase();
  const paths = [
    "tenant-1/request-1/photo-a.jpg",
    "tenant-1/request-1/photo-b.png",
  ];

  const urls = await createEstimatePhotoLinks(fake.client as never, paths);

  assert.deepEqual(urls, [
    "https://signed.example/tenant-1/request-1/photo-a.jpg",
    "https://signed.example/tenant-1/request-1/photo-b.png",
  ]);
  assert.equal(fake.signedUrlCalls.length, 2);
  assert.equal(fake.signedUrlCalls[0].bucket, ESTIMATE_PHOTO_BUCKET);
  assert.equal(fake.signedUrlCalls[0].expiresIn, ESTIMATE_PHOTO_LINK_SECONDS);
  assert.equal(fake.signedUrlCalls[0].expiresIn, 60 * 60 * 24 * 14);
});

test("createEstimatePhotoLinks returns successful URLs in input order", async () => {
  const paths = [
    "tenant-1/request-1/photo-a.jpg",
    "tenant-1/request-1/photo-b.png",
    "tenant-1/request-1/photo-c.webp",
  ];
  const fake = createFakeSupabase({
    failSignPaths: new Set([paths[1]]),
  });

  const urls = await createEstimatePhotoLinks(fake.client as never, paths);

  assert.deepEqual(urls, [
    "https://signed.example/tenant-1/request-1/photo-a.jpg",
    "https://signed.example/tenant-1/request-1/photo-c.webp",
  ]);
});
