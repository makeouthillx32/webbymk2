"use client";

// components/Layouts/overlays/cart/CartShareButton.tsx
//
// Drop this into the CartDrawer's <SheetHeader> area.
// Only visible when the cart has sharing enabled (share_url exists).
//
// Behavior:
//   1. If Web Share API is available (iOS Safari, Android Chrome) → native share sheet
//   2. Otherwise → copies the link to clipboard + shows a brief confirmation
//
// Usage in CartDrawer:
//   import CartShareButton from "./CartShareButton";
//   <CartShareButton />   ← place next to the SheetTitle or in the header row

import { useState, useCallback } from "react";
import { Share2, Check, Link } from "lucide-react";
import { useCart } from "./cart-context";

export default function CartShareButton() {
  const { cart } = useCart();
  const [status, setStatus] = useState<"idle" | "copied" | "shared">("idle");

  // Only render when sharing is active
  const shareUrl = cart?.share_url ?? null;
  const shareName = cart?.share_name ?? "My Desert Cowgirl Wishlist";
  const shareMessage = cart?.share_message ?? "Check out my wishlist on Desert Cowgirl Co.!";

  const handleShare = useCallback(async () => {
    if (!shareUrl) return;

    // ── Prefer the native Web Share API (iOS Safari, Android Chrome, etc.) ──
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: shareName,
          text: shareMessage,
          url: shareUrl,
        });
        // User completed the share — brief confirmation
        setStatus("shared");
        setTimeout(() => setStatus("idle"), 2000);
        return;
      } catch (err: any) {
        // User dismissed the sheet — that's fine, fall through silently
        if (err?.name === "AbortError") return;
        // Unexpected error → fall through to clipboard fallback
        console.warn("Web Share API failed, falling back to clipboard:", err);
      }
    }

    // ── Clipboard fallback for desktop / unsupported browsers ───────────────
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Last resort: execCommand
      const el = document.createElement("textarea");
      el.value = shareUrl;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }

    setStatus("copied");
    setTimeout(() => setStatus("idle"), 2500);
  }, [shareUrl, shareName, shareMessage]);

  // Don't render if cart sharing isn't enabled
  if (!shareUrl) return null;

  return (
    <button
      onClick={handleShare}
      aria-label="Share this wishlist"
      title={
        status === "copied"
          ? "Link copied!"
          : status === "shared"
          ? "Shared!"
          : "Share this wishlist"
      }
      className={[
        "relative flex h-8 w-8 items-center justify-center rounded-full transition-all",
        "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]",
        status !== "idle" ? "text-green-600 hover:text-green-600" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {status === "copied" ? (
        <>
          <Link className="h-4 w-4" />
          {/* Floating "Copied!" tooltip */}
          <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[hsl(var(--foreground))] px-2 py-1 text-xs font-medium text-[hsl(var(--background))] opacity-100 transition-opacity">
            Copied!
          </span>
        </>
      ) : status === "shared" ? (
        <Check className="h-4 w-4" />
      ) : (
        <Share2 className="h-4 w-4" />
      )}
    </button>
  );
}