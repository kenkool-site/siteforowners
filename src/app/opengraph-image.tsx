import { readFile } from "node:fs/promises";
import path from "node:path";
import messages from "../../messages/en.json";

export const runtime = "nodejs";
export const alt = messages.marketing.seo.imageAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const image = await readFile(path.join(process.cwd(), "public/marketing/siteforowners-social-preview.png"));
  return new Response(image, { headers: { "Content-Type": contentType } });
}
