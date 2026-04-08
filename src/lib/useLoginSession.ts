"use client";

import { useEffect, useState } from "react";
import { useSupabaseClient } from "@supabase/auth-helpers-react";
import type { Session } from "@supabase/auth-helpers-nextjs";

export default function useLoginSession() {
  const supabase = useSupabaseClient();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
  const fetchSession = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
  };

    fetchSession(); // on mount

    const params = new URLSearchParams(window.location.search);
    if (params.get("refresh") === "true") {
      fetchSession().then(() => {
        params.delete("refresh");
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, "", newUrl);
      });
    }

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      fetchSession();
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [supabase]);

  return session;
}