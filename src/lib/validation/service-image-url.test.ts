import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  collectInvalidServiceImageErrors,
  isValidPersistedServiceImageUrl,
} from "./service-image-url";

let prevSupabaseUrl: string | undefined;

beforeEach(() => {
  prevSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://xyzcompany.supabase.co";
});

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = prevSupabaseUrl;
});

test("accepts blank image", () => {
  assert.equal(isValidPersistedServiceImageUrl(""), true);
  assert.equal(isValidPersistedServiceImageUrl("   "), true);
});

test("accepts our service-images public URL", () => {
  assert.ok(
    isValidPersistedServiceImageUrl(
      "https://xyzcompany.supabase.co/storage/v1/object/public/service-images/tenants/u/1.jpg",
    ),
  );
});

test("accepts our preview-images public URL", () => {
  assert.ok(
    isValidPersistedServiceImageUrl(
      "https://xyzcompany.supabase.co/storage/v1/object/public/preview-images/previews/u.jpg",
    ),
  );
});

test("accepts HTTPS imported CDN thumbnails", () => {
  assert.ok(
    isValidPersistedServiceImageUrl(
      "https://lh3.googleusercontent.com/p/ABC-DEF=s1200-k-no",
    ),
  );
  assert.ok(isValidPersistedServiceImageUrl("https://cdn.example.com/photo.webp"));
});

test("rejects non-HTTPS external URLs", () => {
  assert.equal(isValidPersistedServiceImageUrl("http://cdn.example.com/x.jpg"), false);
});

test("rejects localhost and RFC1918", () => {
  assert.equal(isValidPersistedServiceImageUrl("https://localhost/evil.jpg"), false);
  assert.equal(isValidPersistedServiceImageUrl("https://192.168.1.1/img"), false);
  assert.equal(isValidPersistedServiceImageUrl("https://10.0.0.5/x"), false);
});

test("reject wrong Supabase bucket path", () => {
  assert.equal(
    isValidPersistedServiceImageUrl(
      "https://xyzcompany.supabase.co/storage/v1/object/public/other-bucket/f.jpg",
    ),
    false,
  );
});

test("collectInvalidServiceImageErrors lists bad rows only", () => {
  const err = collectInvalidServiceImageErrors([
    { name: "A", image: "http://booksy.dev/x.jpg" },
    { name: "B", image: "" },
    { name: "C", image: "https://lh3.googleusercontent.com/ok=yes" },
  ]);
  assert.equal(err.length, 1);
  assert.equal(err[0].index, 0);
});
