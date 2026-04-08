// /lib/getUserProfile.ts
"use server";

import { createClient } from "@/utils/supabase/server";

export async function getUserProfile() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Error fetching profile:", error.message);
    return null;
  }

  return profile;
}

export async function getUserProfileById(userId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, avatar_url")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error fetching profile by ID:", error.message);
    return null;
  }

  return data;
}
