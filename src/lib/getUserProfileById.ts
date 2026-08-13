import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export async function getUserProfileById(id: string) {
  try {
    const supabase = createServerComponentClient({ cookies });

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Supabase profile fetch error:", error.message);
      return null;
    }

    return data;
  } catch (err: any) {
    console.error("getUserProfileById() crashed:", err.message || err);
    return null;
  }
}
