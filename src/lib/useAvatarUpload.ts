// lib/useAvatarUpload.ts
import { useState } from "react";
import { useSessionContext } from "@supabase/auth-helpers-react";

export function useAvatarUpload(userId: string) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { supabaseClient } = useSessionContext();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] || null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    const filePath = `${userId}.png`;
    setUploading(true);

    await supabaseClient.storage.from("avatars").remove([filePath]);

    const { error: uploadError } = await supabaseClient.storage
      .from("avatars")
      .upload(filePath, selectedFile, { upsert: true });

    if (uploadError) {
      alert("Upload failed: " + uploadError.message);
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
      alert("Upload succeeded, but profile update failed: " + updateError.message);
    } else {
      alert("Avatar uploaded and profile updated!");
      location.reload();
    }
  };

  return {
    selectedFile,
    uploading,
    handleFileChange,
    handleUpload,
  };
}