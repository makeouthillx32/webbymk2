"use client";

import { useEffect, useState } from "react";
import { UploadIcon } from "@/assets/icons";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";
import Image from "next/image";
import { useSessionContext } from "@supabase/auth-helpers-react";
import toast from "react-hot-toast";

export function UploadPhotoForm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const { supabaseClient } = useSessionContext();

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) return;
      const user = await res.json();
      setUserId(user.id);
      setAvatarUrl(user.avatar_url);
    };
    fetchData();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !userId) return;

    const filePath = `${userId}.png`;
    setUploading(true);
    toast.loading("Uploading avatar...", { id: "avatar" });

    await supabaseClient.storage.from("avatars").remove([filePath]);

    const { error: uploadError } = await supabaseClient.storage
      .from("avatars")
      .upload(filePath, selectedFile, { upsert: true });

    if (uploadError) {
      toast.error("Upload failed: " + uploadError.message, { id: "avatar" });
      setUploading(false);
      return;
    }

    const timestamp = Date.now();
    const publicUrl = `https://chsmesvozsjcgrwuimld.supabase.co/storage/v1/object/public/avatars/${filePath}?t=${timestamp}`;

    const { error: updateError } = await supabaseClient
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", userId);

    setUploading(false);

    if (updateError) {
      toast.error("Uploaded but failed to update profile.", { id: "avatar" });
    } else {
      toast.success("Avatar updated!", { id: "avatar" });
      location.reload();
    }
  };

  return (
    <ShowcaseSection title="Your Photo" className="!p-7">
      <div className="mb-4 flex items-center gap-3">
        <Image
          src={avatarUrl || "/images/user/user-03.png"}
          width={55}
          height={55}
          alt="User"
          className="size-14 rounded-full object-cover shadow-[var(--shadow-xs)]"
          quality={90}
        />
        <div>
          <span className="mb-1.5 font-medium text-[hsl(var(--foreground))]">
            Edit your photo
          </span>
          <span className="flex gap-3">
            <button
              type="button"
              className="text-body-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]"
              onClick={() => setSelectedFile(null)}
            >
              Delete
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
              className={`text-body-sm font-semibold px-3 py-1.5 rounded transition ${
                uploading || !selectedFile
                  ? "bg-gray-400 cursor-not-allowed text-white"
                  : "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:brightness-95"
              }`}
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </span>
        </div>
      </div>

      <div className="relative mb-5.5 block w-full rounded-[var(--radius)] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))] hover:border-[hsl(var(--sidebar-primary))] shadow-[var(--shadow-sm)]">
        <input
          type="file"
          name="profilePhoto"
          id="profilePhoto"
          accept="image/*"
          hidden
          onChange={handleFileChange}
          disabled={uploading}
        />
        <label
          htmlFor="profilePhoto"
          className="flex cursor-pointer flex-col items-center justify-center p-4 sm:py-7.5"
        >
          <div className="flex size-13.5 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-[var(--shadow-xs)]">
            <UploadIcon />
          </div>
          <p className="mt-2.5 text-body-sm font-medium">
            <span className="text-[hsl(var(--sidebar-primary))]">Click to upload</span> or drag and drop
          </p>
          <p className="mt-1 text-body-xs text-[hsl(var(--muted-foreground))]">
            PNG, JPG or GIF format supported.
          </p>
        </label>
      </div>
    </ShowcaseSection>
  );
}