// src/scripts/upload-wholesale-images.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.API_EXTERNAL_URL || "https://db.unenter.live";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("Uploading wholesale vial images to Supabase storage...");

  const files = [
    { localPath: "public/images/wholesale/bpc-tb-kpv-vial.png", storagePath: "wholesale/bpc-tb-kpv-vial.png" },
    { localPath: "public/images/wholesale/cjc-ipa-vial.png", storagePath: "wholesale/cjc-ipa-vial.png" }
  ];

  const uploadedUrls: Record<string, string> = {};

  for (const file of files) {
    const fileBuffer = readFileSync(join(process.cwd(), file.localPath));
    
    // Ensure bucket exists or use blog-images bucket
    const bucketName = "blog-images";

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(file.storagePath, fileBuffer, {
        contentType: "image/png",
        upsert: true
      });

    if (error) {
      console.warn(`Warning uploading ${file.storagePath} to ${bucketName}:`, error.message);
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(file.storagePath);

    uploadedUrls[file.storagePath] = publicUrlData.publicUrl;
    console.log(`✓ Uploaded ${file.storagePath} -> ${publicUrlData.publicUrl}`);
  }

  console.log("Uploaded URLs:", JSON.stringify(uploadedUrls, null, 2));
}

run();
