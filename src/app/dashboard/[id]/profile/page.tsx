"use client";

import Breadcrumb from "@/components/Breadcrumbs/dashboard";
import Image from "next/image";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import DeleteAccount from "@/components/profile/DeleteAccount";

export default function Page() {
  const [data, setData] = useState({
    name: "",
    profilePhoto: "",
    coverPhoto: "/images/cover/cover-01.png",
    email: "",
    userId: "",
    role: "",
    emailConfirmed: false,
    lastSignIn: "",
    providers: [],
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) return;
      const user = await res.json();

      let roleLabel = user.role;
      try {
        const roleRes = await fetch(`/api/profile/role-label?role_id=${user.role}`);
        if (roleRes.ok) {
          const roleData = await roleRes.json();
          roleLabel = roleData.role || user.role;
        }
      } catch (error) {
        console.error("Failed to fetch role label", error);
      }

      setData({
        name: user.user_metadata.display_name,
        profilePhoto: user.avatar_url,
        coverPhoto: "/images/cover/cover-01.png",
        email: user.email,
        userId: user.id,
        role: roleLabel,
        emailConfirmed: !!user.email_confirmed_at,
        lastSignIn: user.last_sign_in_at,
        providers: user.app_metadata?.providers || [],
      });
    };
    fetchData();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] || null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    const filePath = `${data.userId}.png`;
    setUploading(true);
    await supabase.storage.from("avatars").remove([filePath]);
    const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, selectedFile, { upsert: true });
    if (uploadError) {
      alert("Upload failed: " + uploadError.message);
      setUploading(false);
      return;
    }
    const timestamp = Date.now();
    const publicUrl = `https://chsmesvozsjcgrwuimld.supabase.co/storage/v1/object/public/avatars/${filePath}?t=${timestamp}`;
    const { error: updateError } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", data.userId);
    setUploading(false);
    if (updateError) {
      alert("Upload succeeded, but profile update failed: " + updateError.message);
    } else {
      alert("Avatar uploaded and profile updated!");
      location.reload();
    }
  };

  return (
    <div className="mx-auto w-full max-w-[970px]">
      <Breadcrumb pageName="Profile" />

      <div className="overflow-hidden rounded-[var(--radius)] bg-[hsl(var(--background))] shadow-[var(--shadow-sm)] dark:bg-[hsl(var(--card))] dark:shadow-[var(--shadow-md)]">
        <div className="relative z-20 h-35 md:h-65">
          <Image
            src={data.coverPhoto}
            alt="profile cover"
            className="h-full w-full rounded-tl-[var(--radius)] rounded-tr-[var(--radius)] object-cover object-center"
            width={970}
            height={260}
          />
        </div>

        <div className="px-4 pb-6 text-center lg:pb-8 xl:pb-11.5">
          <div className="relative z-30 mx-auto -mt-22 h-[160px] w-[160px] rounded-full bg-[hsl(var(--background))]/20 p-1 backdrop-blur drop-shadow-2">
            <div className="relative size-full overflow-hidden rounded-full">
              {data.profilePhoto && (
                <>
                  <Image
                    src={data.profilePhoto}
                    width={160}
                    height={160}
                    className="object-cover rounded-full"
                    alt="profile"
                  />
                  <label
                    htmlFor="file-upload"
                    className="absolute bottom-0 right-0 flex size-8.5 cursor-pointer items-center justify-center rounded-full bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] hover:bg-opacity-90"
                  >
                    <input
                      id="file-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      disabled={uploading}
                      className="sr-only"
                    />
                    <span className="sr-only">Edit</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6-6m2 2L9 13l-1 4 4-1 6-6z" />
                    </svg>
                  </label>
                </>
              )}
            </div>
          </div>

          {selectedFile && (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] px-4 py-2 mt-4 rounded-[calc(var(--radius)*0.75)] hover:bg-opacity-90"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          )}

          <div className="mt-8 space-y-4">
            <div className="text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))] font-bold text-lg">{data.name}</div>
            <div className="text-sm text-[hsl(var(--muted-foreground))] dark:text-[hsl(var(--muted-foreground))]">{data.role}</div>
          </div>

          <div className="mt-6 space-y-4 text-left max-w-md mx-auto">
            <Info label="User ID" value={data.userId} />
            <Info label="Email" value={data.email} />
            <Info label="Email Confirmed" value={data.emailConfirmed ? "Yes" : "No"} />
            <Info label="Last Sign In" value={new Date(data.lastSignIn).toLocaleString()} />
            <Info label="Auth Providers" value={data.providers.join(", ")} />
          </div>

          <div className="mt-10">
            <DeleteAccount />
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[hsl(var(--background))] dark:bg-[hsl(var(--card))] rounded-[var(--radius)] shadow-[var(--shadow-sm)] border border-[hsl(var(--border))] dark:border-[hsl(var(--sidebar-border))] p-5">
      <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))] dark:text-[hsl(var(--muted-foreground))] mb-1">{label}</p>
      <p className="text-base font-medium text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))] break-words">{value}</p>
    </div>
  );
}