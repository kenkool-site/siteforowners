import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log("1. Applying previews table migration...");
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/001_create_previews.sql"),
    "utf-8"
  );
  const { error: migrationError } = await supabase.rpc("exec_sql", {
    query: sql,
  });

  // If rpc doesn't exist, fall back to running via REST
  if (migrationError) {
    console.log("   rpc not available, running SQL directly...");
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/`,
      {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!res.ok) {
      console.log(
        "   Could not run migration via API. Please run the SQL manually:"
      );
      console.log(
        "   Go to Supabase Dashboard → SQL Editor → paste contents of:"
      );
      console.log("   supabase/migrations/001_create_previews.sql");
    }
  } else {
    console.log("   Previews table created.");
  }

  console.log("\n2. Creating preview-images storage bucket...");
  const { error: bucketError } = await supabase.storage.createBucket(
    "preview-images",
    {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024, // 5MB
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    }
  );

  if (bucketError) {
    if (bucketError.message.includes("already exists")) {
      console.log("   Bucket already exists — skipping.");
    } else {
      console.error("   Bucket error:", bucketError.message);
    }
  } else {
    console.log("   Bucket created.");
  }

  console.log("\nDone! If the migration didn't run via API, run it manually in the SQL Editor.");
}

main().catch(console.error);
