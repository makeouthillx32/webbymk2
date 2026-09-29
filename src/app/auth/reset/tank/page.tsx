"use client";

// src/app/auth/reset/tank/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Where a Tank password reset lands.
//
// The link used to drop people on the core site's /protected/reset-password,
// which is the right form wearing the wrong brand — someone who only knows Tank
// arrives at unenter.live to "reset your user". Same account underneath, but
// the surface has to be the one they recognise or it reads as phishing.
//
// Tokens arrive in the URL FRAGMENT (#access_token=...). They are taken from
// there and exchanged explicitly rather than trusting whatever session the
// shared .unenter.live cookie already holds — a reset opened in a browser
// signed in as someone else must never change THAT person's password.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { CheckCircle2, Loader2, Lock } from "lucide-react";

const ASSETS =
  "https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images";
const METAL = `${ASSETS}/metal-small-comp.webp`;
const SCREWS = [
  { src: `${ASSETS}/screw-top-left.png`, pos: "left-2 top-2" },
  { src: `${ASSETS}/screw-top-right.png`, pos: "right-2 top-2" },
  { src: `${ASSETS}/screw-bottom-left.png`, pos: "left-2 bottom-2" },
  { src: `${ASSETS}/screw-bottom-right.png`, pos: "right-2 bottom-2" },
];

export default function TankResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    // A hard ceiling, for the same reason the verify page has one: without it a
    // single hanging request leaves a spinner with no error and no way out.
    const deadline = setTimeout(() => {
      if (active && !ready) {
        setLinkError("Could not reach the reset service. Check your connection and try the link again.");
      }
    }, 15_000);

    void (async () => {
      try {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        if (hash.get("error")) {
          if (active) {
            setLinkError(
              (hash.get("error_description") || "This reset link is no longer valid.").replace(/\+/g, " "),
            );
          }
          return;
        }

        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        if (!accessToken || !refreshToken) {
          if (active) setLinkError("This reset link is missing or has expired.");
          return;
        }

        const supabase = createClient();
        const { error: sessionErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionErr) throw sessionErr;
        if (active) setReady(true);
      } catch (err) {
        if (active) {
          setLinkError(err instanceof Error ? err.message : "This reset link could not be opened.");
        }
      }
    })();

    return () => {
      active = false;
      clearTimeout(deadline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white flex items-center justify-center p-4 select-none font-sans">
      <div
        className="relative w-full max-w-md border border-black/80 bg-[#141416] p-8 shadow-2xl space-y-5 text-center"
        style={{
          borderRadius: 6,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 30px rgba(0,0,0,0.7)",
        }}
      >
        {SCREWS.map((s) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={s.pos}
            src={s.src}
            alt=""
            aria-hidden="true"
            className={`pointer-events-none absolute ${s.pos} h-3.5 w-3.5`}
          />
        ))}

        <div
          className="-mx-8 -mt-8 mb-2 px-8 py-3 border-b border-black/80"
          style={{
            backgroundColor: "#2b2f33",
            backgroundImage: `url('${METAL}')`,
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
            Password Reset
          </span>
        </div>

        {done ? (
          <>
            <div className="flex justify-center">
              <div className="grid h-16 w-16 place-items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="h-8 w-8" />
              </div>
            </div>
            <h1 className="text-lg font-bold text-emerald-400">Password changed</h1>
            <p className="text-xs text-slate-300">
              You can close this tab and sign in to Tank with your new password.
            </p>
            <a
              href="https://tank.unenter.live"
              className="block w-full rounded bg-[#ff4d00] px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:brightness-110"
            >
              Return to Tank
            </a>
          </>
        ) : linkError ? (
          <>
            <h1 className="text-lg font-bold text-red-400">Link expired</h1>
            <p className="text-xs text-slate-400">{linkError}</p>
            <p className="text-xs text-slate-300">
              Open Tank and use{" "}
              <span className="font-bold text-[#ff4d00]">Recovery</span> to send a fresh one.
            </p>
            <a
              href="https://tank.unenter.live"
              className="block w-full rounded border border-white/15 bg-white/10 px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-200 hover:bg-white/15"
            >
              Return to Tank
            </a>
          </>
        ) : !ready ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 animate-spin text-[#ff4d00]" />
            <p className="text-xs text-slate-400">Opening your reset link…</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 text-left">
            <p className="text-center text-xs text-slate-400">
              Choose a new password for your Tank login.
            </p>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded border border-black/60 bg-black/70 px-3 py-2 text-xs text-emerald-400 outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                Confirm
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Type it again"
                className="w-full rounded border border-black/60 bg-black/70 px-3 py-2 text-xs text-emerald-400 outline-none"
              />
            </div>
            {error && <p className="text-[11px] font-bold text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded bg-[#ff4d00] px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:brightness-110 disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" />
              {busy ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
