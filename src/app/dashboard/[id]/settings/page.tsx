"use client";

import { useEffect, useState } from "react";
import Breadcrumb from "@/components/Breadcrumbs/dashboard";
import { PersonalInfoForm } from "./_components/personal-info";
import { UploadPhotoForm } from "./_components/upload-photo";
import ManualRoleEditor from "@/components/profile/ManualRoleEditor";
import AdminUserManager from "@/components/profile/AdminDelete";
import { createBrowserClient } from "@/utils/supabase/client";

export default function SettingsPage() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchRole = async () => {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role!inner(name)")
        .eq("id", user.id)
        .single();

      if (!error && profile?.role?.name === "admin") {
        setIsAdmin(true);
      }
    };

    fetchRole();
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1080px]">
      <Breadcrumb pageName="Settings" />

      <div className="grid grid-cols-5 gap-8">
        <div className="col-span-5 xl:col-span-3">
          <PersonalInfoForm />
        </div>
        <div className="col-span-5 xl:col-span-2">
          <UploadPhotoForm />
        </div>
      </div>

      {isAdmin && (
        <div className="mt-10 space-y-12">
          <ManualRoleEditor />
          <AdminUserManager />
        </div>
      )}
    </div>
  );
}