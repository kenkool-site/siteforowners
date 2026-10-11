import React from "react";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ImageResponse } from "next/og";
import messages from "../messages/en.json";

async function generate() {
  const root = process.cwd();
  const photo = await sharp(await readFile(path.join(root, "public/marketing/verticals/locs.png")))
    .resize(460, 630, { fit: "cover", position: "left" }).png().toBuffer();
  const copy = messages.marketing.seo;
  const response = new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#DB2777", color: "#FFF8EE" }}>
      <div style={{ display: "flex", flexDirection: "column", width: 740, padding: "48px 52px", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>SiteForOwners</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 21 }}>{copy.shareSummary}</div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 62, lineHeight: 1.05, letterSpacing: -2 }}>
            <span>{copy.shareTitle}</span><span>{copy.shareAccent}</span>
          </div>
          <div style={{ display: "flex", fontSize: 21 }}>{copy.shareFeatures}</div>
        </div>
        <div style={{ display: "flex", fontSize: 21 }}>siteforowners.com</div>
      </div>
      {/* Native img is required by ImageResponse, not browser UI. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:image/png;base64,${photo.toString("base64")}`} width={460} height={630} alt="" />
    </div>, { width: 1200, height: 630 },
  );
  await writeFile(path.join(root, "public/marketing/siteforowners-social-preview.png"), Buffer.from(await response.arrayBuffer()));
}

generate().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
