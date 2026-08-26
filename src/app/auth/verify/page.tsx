"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, Sparkles, XCircle } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { broadcastVerificationSuccess } from "@/zones/tank/server/authActions";

export default function AuthVerifyPage() {
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function handleAuthVerification() {
      try {
        const supabase = createClient();

        if (typeof window !== "undefined") {
          const searchParams = new URLSearchParams(window.location.search);
          const code = searchParams.get("code");
          const tokenHash = searchParams.get("token_hash");
          const type = searchParams.get("type");

          // 1. Code Exchange
          if (code) {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
            if (data.user?.email && data.user.id) {
              await broadcastVerificationSuccess(data.user.email, data.user.id);
            }
            if (active) setStatus("success");
            return;
          }

          // 2. OTP Verification
          if (tokenHash && type) {
            const { data, error } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: type as any,
            });
            if (error) throw error;
            if (data.user?.email && data.user.id) {
              await broadcastVerificationSuccess(data.user.email, data.user.id);
            }
            if (active) setStatus("success");
            return;
          }
        }

        // 3. Fallback to active session
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email && user.id) {
          await broadcastVerificationSuccess(user.email, user.id);
          if (active) setStatus("success");
        } else {
          if (active) {
            setStatus("error");
            setErrorMessage("Verification link is missing or expired.");
          }
        }
      } catch (err) {
        if (active) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Verification failed.");
        }
      }
    }

    void handleAuthVerification();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0c10] text-white flex items-center justify-center p-4 select-none font-sans">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12161f]/95 p-8 shadow-2xl backdrop-blur-xl space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
        {/* Header Branding */}
        <div className="flex items-center justify-center gap-2 text-xs font-black tracking-widest uppercase text-orange-500">
          <Sparkles className="h-4 w-4" />
          <span>UNENTER AUTH · EMAIL VERIFICATION</span>
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

        {/* Title & Instructions */}
        <div className="space-y-2">
          {status === "verifying" && (
            <>
              <h1 className="text-xl font-bold text-white">Verifying your email...</h1>
              <p className="text-xs text-slate-400">
                Confirming your credentials with unenter.live auth.
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <h1 className="text-xl font-bold text-emerald-400">Email Verified!</h1>
              <p className="text-sm font-semibold text-white">
                You can close this tab now.
              </p>
              <p className="text-xs text-slate-300 pt-1">
                Your Tank window is active and has automatically unlocked chat access.
              </p>
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

        {/* Window Close / Return Button */}
        <div className="pt-2">
          {status === "success" ? (
            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.close();
                  // If window.close() blocked by browser:
                  setTimeout(() => {
                    window.location.href = "https://tank.unenter.live";
                  }, 200);
                }
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 px-6 py-3.5 text-sm font-extrabold uppercase tracking-wider text-white shadow-lg shadow-orange-900/30 hover:brightness-110 active:scale-[0.98] transition"
            >
              <span>Close Window & Return</span>
            </button>
          ) : (
            <a
              href="https://tank.unenter.live"
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
