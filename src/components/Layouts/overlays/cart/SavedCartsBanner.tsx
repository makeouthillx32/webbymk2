"use client";

// components/Layouts/overlays/cart/SavedCartsBanner.tsx
//
// Shown in SharedCartClient immediately after a successful clone.
// Tells the user their old cart was saved and gives a one-click restore.
//
// Also exports <SavedCartsHistory> — a standalone list for showing
// saved snapshots anywhere (e.g. inside the CartDrawer footer).

import { useState, useCallback } from "react";
import { RotateCcw, ChevronDown, ChevronUp, X, Clock } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SavedCart {
  id: string;
  label: string | null;
  trigger: "clone" | "manual" | "checkout" | "expiry";
  source_share_name: string | null;
  item_count: number;
  subtotal_cents: number;
  created_at: string;
  items: any[];
}

// ─── Money helper ─────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function getSessionId() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("dcg_session_id");
  if (!id) {
    id = `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("dcg_session_id", id);
  }
  return id;
}

// ─── SavedCartsBanner ─────────────────────────────────────────────────────────
// Compact single-line banner shown right after a clone.
// Props: savedCartId from the clone API response, onRestore callback.

interface SavedCartsBannerProps {
  savedCartId: string;
  itemCount: number;
  subtotalCents: number;
  onRestore?: () => void;   // called after successful restore
  onDismiss?: () => void;
}

export function SavedCartsBanner({
  savedCartId,
  itemCount,
  subtotalCents,
  onRestore,
  onDismiss,
}: SavedCartsBannerProps) {
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const handleRestore = useCallback(async () => {
    setRestoring(true);
    try {
      const res = await fetch(`/api/saved-carts/${savedCartId}/restore`, {
        method: "POST",
        headers: { "x-session-id": getSessionId() },
      });
      if (res.ok) {
        setRestored(true);
        onRestore?.();
      }
    } catch (err) {
      console.error("Restore failed:", err);
    } finally {
      setRestoring(false);
    }
  }, [savedCartId, onRestore]);

  if (dismissed || restored) return null;

  return (
    <div className="relative flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
      <Clock className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />

      <span className="flex-1 text-amber-900 dark:text-amber-200">
        Your previous cart ({itemCount} {itemCount === 1 ? "item" : "items"} · {fmt(subtotalCents)}) was saved.
      </span>

      <button
        onClick={handleRestore}
        disabled={restoring}
        className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-60 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
      >
        <RotateCcw className={`h-3 w-3 ${restoring ? "animate-spin" : ""}`} />
        {restoring ? "Restoring…" : "Restore it"}
      </button>

      <button
        onClick={() => { setDismissed(true); onDismiss?.(); }}
        className="flex-shrink-0 rounded-full p-0.5 text-amber-500 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-300"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── SavedCartsHistory ────────────────────────────────────────────────────────
// Expandable section listing all saved snapshots.
// Designed to drop inside the CartDrawer footer or a settings page.

interface SavedCartsHistoryProps {
  onRestore?: () => void;
}

export function SavedCartsHistory({ onRestore }: SavedCartsHistoryProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savedCarts, setSavedCarts] = useState<SavedCart[]>([]);
  const [fetched, setFetched] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchSavedCarts = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    try {
      const res = await fetch("/api/saved-carts", {
        headers: { "x-session-id": getSessionId() },
      });
      if (res.ok) {
        const raw = await res.json();
        setSavedCarts(raw.data ?? []);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, [fetched]);

  const handleToggle = useCallback(() => {
    setOpen((v) => {
      if (!v) fetchSavedCarts();
      return !v;
    });
  }, [fetchSavedCarts]);

  const handleRestore = useCallback(
    async (id: string) => {
      setRestoringId(id);
      try {
        const res = await fetch(`/api/saved-carts/${id}/restore`, {
          method: "POST",
          headers: { "x-session-id": getSessionId() },
        });
        if (res.ok) {
          setSavedCarts((prev) => prev.filter((c) => c.id !== id));
          onRestore?.();
        }
      } catch {
        /* silent */
      } finally {
        setRestoringId(null);
      }
    },
    [onRestore]
  );

  if (!open && savedCarts.length === 0 && fetched) return null;

  return (
    <div className="border-t border-[hsl(var(--border))]">
      {/* Toggle row */}
      <button
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-6 py-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] transition hover:text-[hsl(var(--foreground))]"
      >
        <span className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
          Recently saved carts
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {/* List */}
      {open && (
        <div className="px-6 pb-4 space-y-2">
          {loading && (
            <p className="py-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
              Loading…
            </p>
          )}

          {!loading && savedCarts.length === 0 && (
            <p className="py-3 text-center text-xs text-[hsl(var(--muted-foreground))]">
              No recently saved carts.
            </p>
          )}

          {savedCarts.map((cart) => (
            <div
              key={cart.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))/30] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-[hsl(var(--foreground))]">
                  {cart.label ?? "Saved cart"}
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {cart.item_count} {cart.item_count === 1 ? "item" : "items"} · {fmt(cart.subtotal_cents)}
                </p>
              </div>

              <button
                onClick={() => handleRestore(cart.id)}
                disabled={restoringId === cart.id}
                className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1.5 text-xs font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-60"
              >
                <RotateCcw className={`h-3 w-3 ${restoringId === cart.id ? "animate-spin" : ""}`} />
                {restoringId === cart.id ? "…" : "Restore"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}