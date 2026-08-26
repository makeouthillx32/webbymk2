"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, Sparkles, MessageSquare, ArrowRight } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { recordTankAuthSignIn } from "../server/actions";

export function TankVerifyPage() {
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function processVerification() {
      try {
        const supabase = createClient();

        // 1. Check if Supabase session is already active or in hash
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();

        if (sessionErr) {
          throw new Error(sessionErr.message);
        }

        if (session?.user) {
          // Tag user for Tank and initialize profile
          await recordTankAuthSignIn();
          if (active) setStatus("success");
          return;
        }

        // 2. If token hash or code is present in query parameters / URL hash
        if (typeof window !== "undefined") {
          const hash = window.location.hash;
          const searchParams = new URLSearchParams(window.location.search);
          const code = searchParams.get("code");
          const tokenHash = searchParams.get("token_hash");
          const type = searchParams.get("type");

          if (code) {
            const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeErr) throw exchangeErr;
            await recordTankAuthSignIn();
            if (active) setStatus("success");
            return;
          }

          if (tokenHash && type) {
            const { error: otpErr } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: type as any,
            });
            if (otpErr) throw otpErr;
            await recordTankAuthSignIn();
            if (active) setStatus("success");
            return;
          }

          if (hash.includes("access_token")) {
            // Hash token auto-resolved by Supabase client
            setTimeout(async () => {
              const { data: { session: postHashSession } } = await supabase.auth.getSession();
              if (postHashSession?.user) {
                await recordTankAuthSignIn();
                if (active) setStatus("success");
              } else {
                if (active) setStatus("success");
              }
            }, 500);
            return;
          }
        }

        // Fallback: If no token found in URL, show success if already signed in, else error
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await recordTankAuthSignIn();
          if (active) setStatus("success");
        } else {
          if (active) {
            setStatus("error");
            setErrorMessage("Verification link is missing or expired. Please sign in or request a new link.");
          }
        }
      } catch (err) {
        if (active) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Failed to verify account.");
        }
      }
    }

    void processVerification();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0f1117] text-white flex items-center justify-center p-4 select-none font-sans">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161a23]/95 p-8 shadow-2xl backdrop-blur-xl space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
        {/* Header Branding */}
        <div className="flex items-center justify-center gap-2 text-xs font-black tracking-widest uppercase text-orange-500">
          <Sparkles className="h-4 w-4" />
          <span>TANK LIVE VERIFICATION</span>
        </div>

        {/* Status Graphic */}
        <div className="flex justify-center pt-2">
          {status === "verifying" && (
            <div className="relative grid h-20 w-20 place-items-center rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400">
              <Loader2 className="h-10 w-10 animate-spin" />
            </div>
          )}

          {status === "success" && (
            <div className="relative grid h-20 w-20 place-items-center rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <CheckCircle2 className="h-10 w-10 animate-in zoom-in-50 duration-300" />
            </div>
          )}

          {status === "error" && (
            <div className="relative grid h-20 w-20 place-items-center rounded-full bg-red-500/10 border border-red-500/30 text-red-400">
              <AlertCircle className="h-10 w-10 animate-in zoom-in-50 duration-300" />
            </div>
          )}
        </div>

        {/* Title and Message */}
        <div className="space-y-2">
          {status === "verifying" && (
            <>
              <h1 className="text-xl font-bold text-white">Verifying your account...</h1>
              <p className="text-xs text-slate-400">
                Confirming your email and activating chat privileges.
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <h1 className="text-xl font-bold text-white">Account Verified!</h1>
              <p className="text-xs text-slate-300">
                Your email is confirmed and you are ready to chat and participate in Tank LIVE.
              </p>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-[11px] font-bold text-emerald-300 border border-emerald-500/30 mt-2">
                <MessageSquare className="h-3 w-3" />
                <span>Chat Access Enabled</span>
              </div>
            </>
          )}

          {status === "error" && (
            <>
              <h1 className="text-xl font-bold text-red-400">Verification Failed</h1>
              <p className="text-xs text-slate-400">
                {errorMessage || "Link may have expired or is invalid."}
              </p>
            </>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-2">
          {status === "success" ? (
            <a
              href="/"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 px-6 py-3.5 text-sm font-extrabold uppercase tracking-wider text-white shadow-lg shadow-orange-900/30 hover:brightness-110 active:scale-[0.98] transition"
            >
              <span>Enter Tank LIVE</span>
              <ArrowRight className="h-4 w-4" />
            </a>
          ) : (
            <a
              href="/"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-300 hover:bg-white/15 hover:text-white transition"
            >
              <span>Return to Tank</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default TankVerifyPage;
