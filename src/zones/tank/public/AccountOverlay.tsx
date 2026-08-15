"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { LogOut, Shield, User, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { ACTIVE_THEME } from "../theme";

const coreSignIn =
  "https://www.unenter.live/sign-in?next=https%3A%2F%2Ftank.unenter.live%2F";

// Same real-asset chrome as TankExperience.tsx (ChromePanel/ConsoleButton
// kept local rather than shared/exported, so this overlay stays a
// self-contained drop-in — matches the fixtures.ts/contracts.ts import
// pattern already used across the zone).
function ChromePanel({
  children,
  className = "",
  withScrews = false,
}: {
  children: ReactNode;
  className?: string;
  withScrews?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded ${className}`}
      style={{
        background:
          "linear-gradient(90deg,#88868b,#a7a2a6 10%,#a09b9f 50%,#8f8d93 75%,#625f60 90%,#4a4645)",
        border: "3px outset hsla(300,5%,79%,.75)",
        outline: "2px solid rgba(0,0,0,.5)",
        boxShadow:
          "-2px 2px 1px rgba(0,0,0,.75), inset 0 0 4px #cbc6cb, 4px 4px 0 rgba(0,0,0,.75)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ backgroundImage: `url(${ACTIVE_THEME.images.aluminumTexture})`, mixBlendMode: "overlay" }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ backgroundImage: `url(${ACTIVE_THEME.images.metalTexture})`, mixBlendMode: "overlay" }}
      />
      {withScrews && (
        <>
          <img src={ACTIVE_THEME.images.screwTopLeft} alt="" className="pointer-events-none absolute left-1 top-1 z-20 h-3.5 w-3.5" />
          <img src={ACTIVE_THEME.images.screwTopRight} alt="" className="pointer-events-none absolute right-1 top-1 z-20 h-3.5 w-3.5" />
          <img src={ACTIVE_THEME.images.screwBottomLeft} alt="" className="pointer-events-none absolute bottom-1 left-1 z-20 h-3.5 w-3.5" />
          <img src={ACTIVE_THEME.images.screwBottomRight} alt="" className="pointer-events-none absolute bottom-1 right-1 z-20 h-3.5 w-3.5" />
        </>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function ConsoleButton({
  children,
  onClick,
  variant = "gray",
  className = "",
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "gray" | "red" | "blue";
  className?: string;
  href?: string;
}) {
  const bg =
    variant === "red"
      ? ACTIVE_THEME.images.buttonRed
      : variant === "blue"
        ? ACTIVE_THEME.images.buttonBlue
        : ACTIVE_THEME.images.buttonGray;
  const style: React.CSSProperties = {
    backgroundImage: `url(${bg})`,
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
    fontFamily: ACTIVE_THEME.fonts.label,
    textShadow: "0 1px 0 rgba(255,255,255,.4)",
  };
  const classes = `relative flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-[#2c2717] transition hover:brightness-105 active:brightness-95 ${className}`;
  if (href) {
    return (
      <Link href={href} className={classes} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes} style={style}>
      {children}
    </button>
  );
}

// Overlay-driven account panel — matches the reference Fishtank profile
// overlay's real chrome (screwed metal panel, console-button PNGs, LED
// readout) rather than a CSS approximation. Still only ever shows real
// session state: no missions, XP, season pass, or medals, since there is
// no data model for that yet.
export function AccountOverlay({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<"loading" | "signed-in" | "signed-out">(
    "loading",
  );
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (data.user) {
        setEmail(data.user.email ?? null);
        setStatus("signed-in");
      } else {
        setStatus("signed-out");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Account"
    >
      <ChromePanel withScrews className="w-full max-w-sm" >
        <div onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-black/40 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" style={{ color: "#241f14" }} />
              <span
                className="text-xs font-black uppercase tracking-widest"
                style={{ color: "#241f14", fontFamily: ACTIVE_THEME.fonts.label }}
              >
                Settings
              </span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-6 w-6 place-items-center rounded-full border border-black/40 bg-gradient-to-b from-[#ff8a7a] to-[#ff3b2f] text-white shadow-[inset_1px_1px_0_rgba(255,255,255,.5)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-4 p-5">
            {status === "loading" && (
              <p className="text-sm" style={{ color: "#241f14cc" }}>
                Checking session…
              </p>
            )}
            {status === "signed-out" && (
              <>
                <p className="text-sm" style={{ color: "#241f14cc" }}>
                  Sign in to follow rooms and chat.
                </p>
                <a href={coreSignIn} className="block">
                  <ConsoleButton variant="blue" className="w-full">
                    Sign in
                  </ConsoleButton>
                </a>
              </>
            )}
            {status === "signed-in" && (
              <>
                <div>
                  <span
                    className="mb-1 block text-[10px] font-black uppercase tracking-widest"
                    style={{ color: "#241f1499" }}
                  >
                    Signed in as
                  </span>
                  <div
                    className="rounded border border-[#233326] bg-black px-2.5 py-1.5 text-xs font-bold tracking-[.1em]"
                    style={{ color: "#39ff6a", fontFamily: ACTIVE_THEME.fonts.display, textShadow: "0 0 6px rgba(57,255,106,.7)" }}
                  >
                    {email}
                  </div>
                </div>
                <ConsoleButton href="/admin" className="w-full">
                  <Shield className="h-4 w-4" />
                  Backstage
                </ConsoleButton>
                <ConsoleButton variant="red" className="w-full" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </ConsoleButton>
              </>
            )}
          </div>
        </div>
      </ChromePanel>
    </div>
  );
}
