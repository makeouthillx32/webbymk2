"use client";

import React, { useEffect, useState } from "react";
import { LogOut, Shield, User, X, KeyRound, UserPlus, AlertCircle, CheckCircle2, Sparkles, Mail, Send, ArrowLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { ChromePanel } from "./components/ChromePanel";
import { ConsoleButton } from "./components/ConsoleButton";
import { drainClientChatStorage } from "./useTankRealtimeChat";
import { recordTankAuthSignIn } from "../server/actions";
import { registerTankUser, resendTankVerification, checkEmailVerified } from "../server/authActions";
import { ACTIVE_THEME } from "../theme";
import { buildGlobalLogoutUrl, buildOAuthStartUrl } from "@/lib/authRedirect";
import { resolveTankDisplayName } from "../identity";

const LED_GREEN = "#39ff6a";
const LED_RED = "#ff3b2f";
const LED_AMBER = "#ffb020";

type AuthTab = "signin" | "signup" | "reset" | "verify";

function GoogleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function FacebookIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export function AccountOverlay({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<"loading" | "signed-in" | "signed-out">("loading");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  // Auth form states
  const [tab, setTab] = useState<AuthTab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signUpName, setSignUpName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      if (data.user) {
        await recordTankAuthSignIn();
        const [{ data: tankProfile }, { data: coreProfile }] = await Promise.all([
          supabase.from("tank_profiles").select("display_name").eq("user_id", data.user.id).maybeSingle(),
          supabase.from("profiles").select("display_name, role").eq("id", data.user.id).maybeSingle(),
        ]);
        if (!active) return;
        setUserEmail(data.user.email ?? null);
        setUserRole(coreProfile?.role || (data.user.app_metadata?.role as string) || "member");
        setDisplayName(resolveTankDisplayName({
          tankDisplayName: tankProfile?.display_name,
          coreDisplayName: coreProfile?.display_name,
          authDisplayName: data.user.user_metadata?.display_name,
          providerFullName: data.user.user_metadata?.full_name,
          providerUserName: data.user.user_metadata?.user_name,
          email: data.user.email,
          fallback: "Member",
        }));
        setTags((data.user.user_metadata?.tags as string[]) || ["tank"]);
        setStatus("signed-in");
      } else {
        setStatus("signed-out");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const [isVerifiedLive, setIsVerifiedLive] = useState(false);

  // Live background verification watcher: seamlessly logs user in when email is confirmed in another tab/device
  useEffect(() => {
    if (tab !== "verify" || !email.trim() || isVerifiedLive) return;

    let active = true;
    const cleanEmail = email.toLowerCase().trim();
    const supabase = createClient();

    const completeVerificationLogin = async () => {
      if (!active || isVerifiedLive) return;
      setIsVerifiedLive(true);
      setSuccessMsg("Account verified! Logging you in...");

      try {
        if (password) {
          const { data, error: signErr } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });
          if (!signErr && data.user) {
            await recordTankAuthSignIn();
            setTimeout(() => {
              window.location.reload();
            }, 800);
            return;
          }
        }
      } catch {}

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    };

    // 1. Supabase Realtime channel broadcast listener
    const channel = supabase.channel(`tank:auth:verified:${cleanEmail}`);
    channel
      .on("broadcast", { event: "account_verified" }, () => {
        void completeVerificationLogin();
      })
      .subscribe();

    // 2. Fallback polling check every 2 seconds
    const interval = setInterval(async () => {
      if (!active) return;
      const res = await checkEmailVerified(cleanEmail);
      if (res.verified) {
        void completeVerificationLogin();
      }
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [tab, email, password, isVerifiedLive]);

  const handleOAuthSignIn = (provider: "google" | "facebook") => {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const returnTarget = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
      const startUrl = buildOAuthStartUrl({
        currentOrigin: window.location.origin,
        provider,
        next: returnTarget,
      });
      window.location.assign(startUrl);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Failed to initiate provider sign in.");
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessMsg(null);

    const supabase = createClient();
    const { data, error: authErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authErr) {
      setBusy(false);
      const isUnconfirmed =
        authErr.message?.toLowerCase().includes("email not confirmed") ||
        authErr.message?.toLowerCase().includes("not confirmed") ||
        authErr.message?.toLowerCase().includes("unverified");

      if (isUnconfirmed) {
        // Automatically dispatch fresh verification email and transition to verify screen
        void resendTankVerification({
          email: email.trim(),
          origin: typeof window !== "undefined" ? window.location.origin : "https://tank.unenter.live",
        });
        setTab("verify");
        setSuccessMsg(`Waiting for you to verify your account, an email was sent to ${email.trim()}.`);
        return;
      }

      setError(authErr?.message ?? "Failed to sign in. Please verify your credentials.");
      return;
    }

    if (!data?.user) {
      setBusy(false);
      setError("Failed to sign in. Please verify your credentials.");
      return;
    }

    // Check if user email is confirmed
    const isEmailConfirmed = Boolean(data.user.email_confirmed_at || data.user.confirmed_at);
    const provider = data.user.app_metadata?.provider || "email";
    if (!isEmailConfirmed && provider === "email") {
      void resendTankVerification({
        email: email.trim(),
        origin: typeof window !== "undefined" ? window.location.origin : "https://tank.unenter.live",
      });
      setBusy(false);
      setTab("verify");
      setSuccessMsg(`Waiting for you to verify your account, an email was sent to ${email.trim()}.`);
      return;
    }

    // Record Tank authentication tag & initialize profile
    await recordTankAuthSignIn();

    setBusy(false);
    setSuccessMsg("Signed in successfully! Loading console...");
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessMsg(null);

    const res = await registerTankUser({
      email: email.trim(),
      password,
      displayName: signUpName.trim(),
      origin: typeof window !== "undefined" ? window.location.origin : "https://tank.unenter.live",
    });

    setBusy(false);

    if (!res.success) {
      setError(res.error || "Registration failed.");
      return;
    }

    // Already an unenter member — from the shop, labs, anywhere. Promotion
    // gave them their Tank rows but NOT a session, so reloading here would
    // just bounce them back signed-out. Send them to sign-in with the email
    // already filled, and say plainly why they are not being asked to verify.
    if (res.alreadyMember) {
      setTab("signin");
      setPassword("");
      setSuccessMsg(
        res.message ?? "You already have an unenter account — just sign in.",
      );
      return;
    }

    if (res.needsVerification) {
      setTab("verify");
      setSuccessMsg(`Verification email dispatched to ${email.trim()}! Please verify to chat.`);
    } else {
      setSuccessMsg("Account created! Loading console...");
      setTimeout(() => {
        window.location.reload();
      }, 600);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) {
      setError("Please enter your account email to resend verification.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    const res = await resendTankVerification({
      email: email.trim(),
      origin: typeof window !== "undefined" ? window.location.origin : "https://tank.unenter.live",
    });
    setBusy(false);
    if (res.success) {
      setSuccessMsg(res.message || "Fresh verification email sent!");
    } else {
      setError(res.error || "Failed to resend verification.");
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your account email.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccessMsg(null);

    const supabase = createClient();
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim());

    setBusy(false);
    if (resetErr) {
      setError(resetErr.message);
    } else {
      setSuccessMsg("Password reset link sent! Check your inbox.");
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    drainClientChatStorage();
    window.location.assign(buildGlobalLogoutUrl(`${window.location.origin}/`));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Account Authorization"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
        <ChromePanel withScrews contentClassName="!p-0 flex flex-col overflow-hidden">
          {/* Top Bezel Header */}
          <div className="flex h-12 items-center justify-between border-b border-black/40 px-8">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-black uppercase tracking-widest"
                style={{ color: "#241f14", fontFamily: ACTIVE_THEME.fonts.label }}
              >
                tank<span className="text-[#ff4d00]">®</span> {status === "signed-in" ? "Credentials" : "Auth"}
              </span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-6 w-6 place-items-center rounded-full border border-black/40 bg-gradient-to-b from-[#ff8a7a] to-[#ff3b2f] text-white shadow-[inset_1px_1px_0_rgba(255,255,255,.5)] hover:brightness-110 active:brightness-95"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="px-8 py-5">
            {status === "loading" && (
              <div className="py-8 text-center">
                <p className="text-xs font-bold tracking-widest animate-pulse" style={{ color: "#241f14" }}>
                  QUERYING AUTHORIZATION MATRIX...
                </p>
              </div>
            )}

            {status === "signed-in" && (
              <div className="space-y-4">
                <div>
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-[#4c4630]">
                    Authorized Profile
                  </span>
                  <div
                    className="rounded border border-[#233326] bg-black/90 p-3 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"
                    style={{ fontFamily: ACTIVE_THEME.fonts.dotMatrix }}
                  >
                    <p className="text-sm font-black tracking-wider" style={{ color: LED_GREEN }}>
                      {displayName}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{userEmail}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/10">
                      <span className="rounded bg-emerald-950/80 border border-emerald-500/50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-400">
                        {userRole}
                      </span>
                      {tags.map((t) => (
                        <span key={t} className="rounded bg-blue-950/80 border border-blue-500/50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-blue-300">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  {userRole === "admin" && (
                    <ConsoleButton href="/admin" className="w-full">
                      <Shield className="h-4 w-4" />
                      Backstage Operations
                    </ConsoleButton>
                  )}
                  <ConsoleButton variant="red" className="w-full" disabled={busy} onClick={handleSignOut}>
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </ConsoleButton>
                </div>
              </div>
            )}

            {status === "signed-out" && (
              <div className="space-y-4">
                {/* Tabs */}
                <div className="flex border-b border-black/40 pb-1 gap-1">
                  <button
                    type="button"
                    onClick={() => { setTab("signin"); setError(null); setSuccessMsg(null); }}
                    className={`flex-1 rounded-t py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                      tab === "signin" ? "bg-black/25 text-[#241f14]" : "text-[#5a5442] hover:text-[#241f14]"
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTab("signup"); setError(null); setSuccessMsg(null); }}
                    className={`flex-1 rounded-t py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                      tab === "signup" ? "bg-black/25 text-[#241f14]" : "text-[#5a5442] hover:text-[#241f14]"
                    }`}
                  >
                    Register
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTab("reset"); setError(null); setSuccessMsg(null); }}
                    className={`flex-1 rounded-t py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                      tab === "reset" ? "bg-black/25 text-[#241f14]" : "text-[#5a5442] hover:text-[#241f14]"
                    }`}
                  >
                    Recovery
                  </button>
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="flex items-center gap-2 rounded border border-red-900 bg-red-950/80 p-2.5 text-xs text-red-200 shadow-inner">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Success Banner */}
                {successMsg && (
                  <div className="flex items-center gap-2 rounded border border-emerald-900 bg-emerald-950/80 p-2.5 text-xs text-emerald-200 shadow-inner">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {/* ── Gamified Social Auth Tiles (Signin & Signup) ── */}
                {(tab === "signin" || tab === "signup") && (
                  <div className="space-y-2">
                    {/* Primary Google Block Tile */}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleOAuthSignIn("google")}
                      className="group relative w-full flex items-center justify-between gap-3 overflow-hidden rounded-lg border-2 border-black/80 bg-gradient-to-b from-[#ffffff] to-[#e4e4e7] p-3 text-left shadow-[0_3px_0_#232920,inset_0_1px_0_rgba(255,255,255,1)] transition-all hover:brightness-105 active:translate-y-0.5 active:shadow-[0_1px_0_#232920] disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid h-8 w-8 place-items-center rounded-md bg-white border border-black/20 shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                          <GoogleIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider text-[#1a1a1e]" style={{ fontFamily: ACTIVE_THEME.fonts.label }}>
                            Sign In with Google
                          </p>
                          <p className="text-[10px] font-semibold text-[#52525b]">
                            Fast 1-Click Verification
                          </p>
                        </div>
                      </div>
                      <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[8px] font-black uppercase text-emerald-800 shrink-0">
                        INSTANT
                      </span>
                    </button>

                    {/* Secondary Facebook Block Tile */}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleOAuthSignIn("facebook")}
                      className="group relative w-full flex items-center justify-between gap-3 overflow-hidden rounded-lg border-2 border-black/80 bg-gradient-to-b from-[#1877F2] to-[#1460c4] p-3 text-left text-white shadow-[0_3px_0_#232920,inset_0_1px_0_rgba(255,255,255,0.3)] transition-all hover:brightness-110 active:translate-y-0.5 active:shadow-[0_1px_0_#232920] disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid h-8 w-8 place-items-center rounded-md bg-white shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                          <FacebookIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider text-white" style={{ fontFamily: ACTIVE_THEME.fonts.label }}>
                            Sign In with Facebook
                          </p>
                          <p className="text-[10px] font-semibold text-blue-100">
                            Meta Account Login
                          </p>
                        </div>
                      </div>
                      <span className="rounded bg-blue-400/30 border border-white/30 px-1.5 py-0.5 text-[8px] font-black uppercase text-white shrink-0">
                        OAUTH
                      </span>
                    </button>

                    {/* Tactile Divider */}
                    <div className="relative my-3 text-center">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-black/30" />
                      </div>
                      <span className="relative bg-[#a49a83] px-2 text-[9px] font-black uppercase tracking-widest text-[#3d382b]">
                        Or Operator Credentials
                      </span>
                    </div>
                  </div>
                )}

                {/* Sign In Form */}
                {tab === "signin" && (
                  <form onSubmit={handleSignIn} className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-[#4c4630] mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="player@tank.live"
                        className="w-full rounded border border-black/50 bg-black/90 px-3 py-2 text-xs text-emerald-400 placeholder:text-slate-600 outline-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-[#4c4630] mb-1">
                        Password
                      </label>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full rounded border border-black/50 bg-black/90 px-3 py-2 text-xs text-emerald-400 placeholder:text-slate-600 outline-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"
                      />
                    </div>
                    <ConsoleButton type="submit" variant="orange" className="w-full !py-2.5 mt-2" disabled={busy}>
                      <KeyRound className="h-3.5 w-3.5" />
                      {busy ? "Authenticating..." : "Sign In to Tank"}
                    </ConsoleButton>
                  </form>
                )}

                {/* Sign Up Form */}
                {tab === "signup" && (
                  <form onSubmit={handleSignUp} className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-[#4c4630] mb-1">
                        Display Name / Handle
                      </label>
                      <input
                        type="text"
                        value={signUpName}
                        onChange={(e) => setSignUpName(e.target.value)}
                        placeholder="CommanderTank"
                        className="w-full rounded border border-black/50 bg-black/90 px-3 py-2 text-xs text-emerald-400 placeholder:text-slate-600 outline-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-[#4c4630] mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="cadet@tank.live"
                        className="w-full rounded border border-black/50 bg-black/90 px-3 py-2 text-xs text-emerald-400 placeholder:text-slate-600 outline-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-[#4c4630] mb-1">
                          Password
                        </label>
                        <input
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full rounded border border-black/50 bg-black/90 px-3 py-2 text-xs text-emerald-400 placeholder:text-slate-600 outline-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-[#4c4630] mb-1">
                          Confirm
                        </label>
                        <input
                          type="password"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full rounded border border-black/50 bg-black/90 px-3 py-2 text-xs text-emerald-400 placeholder:text-slate-600 outline-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"
                        />
                      </div>
                    </div>
                    <ConsoleButton type="submit" variant="orange" className="w-full !py-2.5 mt-2" disabled={busy}>
                      <UserPlus className="h-3.5 w-3.5" />
                      {busy ? "Registering..." : "Create Tank Account"}
                    </ConsoleButton>
                  </form>
                )}

                {/* Password Reset Form */}
                {tab === "reset" && (
                  <form onSubmit={handleResetPassword} className="space-y-3">
                    <p className="text-[11px] text-[#4c4630] leading-relaxed">
                      Enter your account email to receive an instant recovery link.
                    </p>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-[#4c4630] mb-1">
                        Account Email
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="player@tank.live"
                        className="w-full rounded border border-black/50 bg-black/90 px-3 py-2 text-xs text-emerald-400 placeholder:text-slate-600 outline-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"
                      />
                    </div>
                    <ConsoleButton type="submit" variant="gray" className="w-full !py-2.5 mt-2" disabled={busy}>
                      {busy ? "Sending..." : "Send Recovery Link"}
                    </ConsoleButton>
                  </form>
                )}

                {/* Waiting for Email Verification View */}
                {tab === "verify" && (
                  <div className="space-y-4 text-center py-2 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex justify-center">
                      {isVerifiedLive ? (
                        <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/20 border-2 border-emerald-500/60 text-emerald-400 shadow-lg animate-in zoom-in-50 duration-300">
                          <CheckCircle2 className="h-9 w-9 text-emerald-400" />
                        </div>
                      ) : (
                        <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-orange-500/10 border-2 border-orange-500/40 text-orange-500 shadow-inner">
                          <div className="absolute inset-0 rounded-full border border-orange-500/20 animate-ping" />
                          <Mail className="h-7 w-7 animate-pulse text-orange-400" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {isVerifiedLive ? (
                        <>
                          <h3 className="text-sm font-black uppercase tracking-wider text-emerald-600">
                            Email Verified!
                          </h3>
                          <p className="text-xs text-[#5a5442] font-semibold">
                            Logging you in and activating chat...
                          </p>
                        </>
                      ) : (
                        <>
                          <h3 className="text-sm font-black uppercase tracking-wider text-[#241f14]">
                            Waiting for Account Verification
                          </h3>
                          <p className="text-xs text-[#5a5442] leading-relaxed">
                            Waiting for you to verify your account, an email was sent to:
                          </p>
                          <p className="inline-block rounded bg-black/90 px-3 py-1 font-mono text-xs font-bold text-emerald-400 border border-black/40">
                            {email}
                          </p>
                          <p className="text-[11px] text-[#5a5442] pt-1">
                            Click <strong>Verify Email Address</strong> in your email on any device. This window will <strong>automatically detect when you verify</strong> and log you in.
                          </p>
                        </>
                      )}
                    </div>

                    {!isVerifiedLive && (
                      <div className="space-y-2 pt-2 border-t border-black/15">
                        <ConsoleButton
                          type="button"
                          variant="orange"
                          onClick={handleResendVerification}
                          disabled={busy}
                          className="w-full !py-2"
                        >
                          <Send className="h-3.5 w-3.5" />
                          {busy ? "Sending..." : "Resend Verification Email"}
                        </ConsoleButton>

                        <button
                          type="button"
                          onClick={() => {
                            setTab("signin");
                            setError(null);
                            setSuccessMsg(null);
                          }}
                          className="flex items-center justify-center gap-1.5 w-full text-center text-xs font-bold text-[#4c4630] hover:text-[#241f14] py-1 transition"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                          <span>Return to Sign In</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </ChromePanel>
      </div>
    </div>
  );
}
