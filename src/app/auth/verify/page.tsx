"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, Sparkles, XCircle } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { broadcastVerificationSuccess } from "@/zones/tank/server/authActions";
import {
  clearAuthNavigationIntent,
  markAuthNavigationIntent,
} from "@/lib/authNavigationIntent";

// Tank console furniture. Same assets the overlays and the email use, so the
// three surfaces a new viewer sees — modal, email, landing page — are one thing.
const TANK_ASSETS =
  "https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images";
const TANK_METAL = `${TANK_ASSETS}/metal-small-comp.webp`;
const TANK_SCREWS = [
  { src: `${TANK_ASSETS}/screw-top-left.png`, pos: "left-2 top-2" },
  { src: `${TANK_ASSETS}/screw-top-right.png`, pos: "right-2 top-2" },
  { src: `${TANK_ASSETS}/screw-bottom-left.png`, pos: "left-2 bottom-2" },
  { src: `${TANK_ASSETS}/screw-bottom-right.png`, pos: "right-2 bottom-2" },
];

export function AuthVerifyView({ forceTank = false }: { forceTank?: boolean }) {
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Which zone sent them here.
   *
   * auth.unenter.live serves every zone's verification, but the zones are
   * deliberately separate identities — Tank, shop, labs and blog each have
   * their own. Someone who signed up watching the stream should not be handed
   * core branding halfway through; it reads as a phishing page, not a platform.
   * Defaults to the generic shell for any zone that has not asked for its own.
   */
  // forceTank comes from the ROUTE (/auth/verify/tank), not a query string.
  // GoTrue drops the query on its error redirect — an expired link lands on
  // /auth/verify#error=... with the zone hint gone — so a path is the only
  // carrier that survives both the success and failure paths.
  const [isTank, setIsTank] = useState(forceTank);
  useEffect(() => {
    if (forceTank || typeof window === "undefined") return;
    setIsTank(new URLSearchParams(window.location.search).get("zone") === "tank");
  }, [forceTank]);

  useEffect(() => {
    let active = true;

    // Nothing in the flow below had a deadline, so a single hanging request —
    // a slow network, a blocked host, a captive portal — left the page spinning
    // on "Verifying your email" with no error and no way out. Reported from a
    // different network, where it never finished at all.
    const deadline = setTimeout(() => {
      if (!active) return;
      setStatus((current) => {
        if (current !== "verifying") return current;
        setErrorMessage(
          "Could not reach the verification service. Check your connection and open the link again.",
        );
        return "error";
      });
    }, 15_000);

    async function handleAuthVerification() {
      try {
        const supabase = createClient();

        if (typeof window !== "undefined") {
          // GoTrue reports failures in the URL FRAGMENT, not the query:
          //   /auth/verify#error=access_denied&error_code=403
          //   &error_description=Email+link+is+invalid+or+has+expired
          // Reading only the query meant every expired link fell through to a
          // generic "missing or expired" while the server had said exactly what
          // was wrong. Handled first because there is nothing to verify after it.
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          const hashError = hash.get("error") || hash.get("error_code");
          if (hashError) {
            clearAuthNavigationIntent();
            if (active) {
              setStatus("error");
              setErrorMessage(
                (hash.get("error_description") || "This link is no longer valid.").replace(/\+/g, " "),
              );
            }
            return;
          }

          const searchParams = new URLSearchParams(window.location.search);
          const code = searchParams.get("code");
          const tokenHash = searchParams.get("token_hash");
          const type = searchParams.get("type");

          // 1. Code Exchange
          if (code) {
            markAuthNavigationIntent();
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
            markAuthNavigationIntent();
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

          // 3. Tokens in the FRAGMENT — the normal success shape for a
          //    magiclink/signup verify:
          //      /auth/verify/tank#access_token=...&refresh_token=...
          //
          //    Taking the identity from THIS token is the whole point. The old
          //    code fell through to getUser(), which reads the shared
          //    .unenter.live cookie — so verifying a link in a browser already
          //    signed in as somebody else reported THAT person as verified and
          //    landed on their account. Confirmed live: an admin session
          //    swallowed a new viewer's verification.
          const accessToken = hash.get("access_token");
          const refreshToken = hash.get("refresh_token");
          if (accessToken && refreshToken) {
            markAuthNavigationIntent();
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) throw error;
            if (data.user?.email && data.user.id) {
              await broadcastVerificationSuccess(data.user.email, data.user.id);
            }
            if (active) setStatus("success");
            return;
          }
        }

        // No code, no token_hash, no tokens in the fragment: this is not a
        // verification link. Deliberately NOT falling back to "whoever is signed
        // in" — that is what crossed one person's verification onto another's
        // session, and an already-signed-in visitor is not evidence that THIS
        // link was good.
        if (active) {
          setStatus("error");
          setErrorMessage("Verification link is missing or expired.");
        }
      } catch (err) {
        clearAuthNavigationIntent();
        if (active) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Verification failed.");
        }
      }
    }

    void handleAuthVerification();

    return () => {
      active = false;
      clearTimeout(deadline);
    };
  }, []);

  return (
    <div
      className={`min-h-screen text-white flex items-center justify-center p-4 select-none font-sans ${
        isTank ? "bg-[#0a0a0b]" : "bg-[#0a0c10]"
      }`}
    >
      <div
        className={
          isTank
            ? "relative w-full max-w-md border border-black/80 bg-[#141416] p-8 shadow-2xl space-y-6 text-center animate-in fade-in zoom-in-95 duration-200"
            : "w-full max-w-md rounded-2xl border border-white/10 bg-[#12161f]/95 p-8 shadow-2xl backdrop-blur-xl space-y-6 text-center animate-in fade-in zoom-in-95 duration-200"
        }
        style={
          isTank
            ? {
                borderRadius: 6,
                // Solid colour underneath: the texture is WebP and this page is
                // the last thing between a viewer and their account.
                backgroundColor: "#141416",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 30px rgba(0,0,0,0.7)",
              }
            : undefined
        }
      >
        {isTank &&
          TANK_SCREWS.map((screw) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={screw.pos}
              src={screw.src}
              alt=""
              aria-hidden="true"
              className={`pointer-events-none absolute ${screw.pos} h-3.5 w-3.5 select-none`}
            />
          ))}

        {/* Header Branding */}
        {isTank ? (
          <div
            className="-mx-8 -mt-8 mb-2 px-8 py-3 border-b border-black/80"
            style={{
              backgroundColor: "#2b2f33",
              backgroundImage: `url('${TANK_METAL}')`,
              backgroundRepeat: "repeat",
              borderRadius: "6px 6px 0 0",
            }}
          >
            <span
              className="text-sm font-black uppercase tracking-[0.18em] text-white"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.85)" }}
            >
              Tank<span className="text-[#ff4d00]">&nbsp;Live</span>
            </span>
            <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Account Verification
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-xs font-black tracking-widest uppercase text-orange-500">
            <Sparkles className="h-4 w-4" />
            <span>UNENTER AUTH · EMAIL VERIFICATION</span>
          </div>
        )}

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
                {isTank
                  ? "Checking your Tank credentials…"
                  : "Confirming your credentials with unenter.live auth."}
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
              <h1 className="text-xl font-bold text-red-400">
                {isTank ? "Link expired" : "Verification Failed"}
              </h1>
              <p className="text-xs text-slate-400">
                {errorMessage || "Link may have expired or is invalid."}
              </p>
              {isTank && (
                // The actionable half. An expired link is the single most common
                // way someone lands here, and "failed" alone leaves them stuck.
                <p className="pt-1 text-xs text-slate-300">
                  Head back to Tank and hit{" "}
                  <span className="font-bold text-[#ff4d00]">Resend verification email</span> —
                  the newest link is the only one that works.
                </p>
              )}
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

export default function AuthVerifyPage() {
  return <AuthVerifyView />;
}
