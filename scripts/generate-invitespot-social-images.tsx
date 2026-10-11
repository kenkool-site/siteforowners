/** Rebuild static sharing assets after changing the InviteSpot marketing copy. */
import React from "react";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ImageResponse } from "next/og";
import { invitespotSeoCopy, type InvitespotLocale } from "../src/lib/invitespot-seo";

const root = process.cwd();
const assets = ["wedding-portrait", "birthday", "family", "wedding-dance"];

async function generate() {
  const images = await Promise.all(assets.map(async (name) => {
    const image = await sharp(await readFile(path.join(root, "public/invitespot/photos", `${name}.webp`)))
      .resize(280, 240, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${image.toString("base64")}`;
  }));
  for (const locale of ["en", "es"] as const satisfies readonly InvitespotLocale[]) {
    const copy = invitespotSeoCopy(locale);
    const response = new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#FBF3F0", padding: "52px 56px", color: "#2E1A1E", gap: 44 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 600, justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 32, color: "#6B2F3A", fontWeight: 700 }}>InviteSpot</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", fontSize: locale === "es" ? 52 : 58, letterSpacing: -2, lineHeight: 1.08 }}>{copy.shareTitle}</div>
            <div style={{ display: "flex", fontSize: locale === "es" ? 52 : 58, letterSpacing: -2, lineHeight: 1.08, color: "#98404D" }}>{copy.shareAccent}</div>
            <div style={{ display: "flex", fontSize: 21, color: "#70575C", marginTop: 16, lineHeight: 1.4 }}>{copy.shareSummary}</div>
          </div>
          <div style={{ display: "flex", fontSize: 20, color: "#6B2F3A" }}>invitespot.app</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, width: 400, alignContent: "center" }}>
          {images.map((src, index) => (
            // ImageResponse requires a native img with explicit dimensions.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={assets[index]} src={src} alt="" width={194} height={218} style={{ objectFit: "cover", borderRadius: 8 }} />
          ))}
        </div>
      </div>,
      { width: 1200, height: 630 },
    );
    const output = path.join(root, "public/invitespot", `social-preview-${locale}.png`);
    await writeFile(output, Buffer.from(await response.arrayBuffer()));
    console.log(`Saved ${output}`);
  }
}

generate().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
