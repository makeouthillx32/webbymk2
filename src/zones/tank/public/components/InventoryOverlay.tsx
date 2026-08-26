"use client";

import React, { useState } from "react";
import {
  X,
  Store,
  ArrowLeftRight,
  Hammer,
  Sparkles,
  Plus,
  ArrowRight,
  Coins,
  Package,
} from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { ACTIVE_THEME } from "../../theme";
import type { TankInventoryEntry } from "../../server/gamification";
import { useTankItem, spinTankPrizeMachine, craftTankFusion } from "../../server/actions";
import { getTankItemIcon, getTankItemEmoji, TANK_ITEM_CATALOG } from "../../tankItemCatalog";

export type InventoryOverlayProps = {
  inventory?: TankInventoryEntry[];
  onClose: () => void;
  onOpenShop?: () => void;
  targetRoomKey?: string | null;
};

export type AuthenticInventoryItem = {
  id: string;
  name: string;
  quantity: number;
  iconUrl: string;
  emoji: string;
  rarityColor: string; // 'none' | '#22c55e' | '#3b82f6' | '#a855f7' | '#eab308'
  description?: string;
  slug?: string;
  audioEffectType?: TankInventoryEntry["audioEffectType"];
};

export const DEFAULT_AUTHENTIC_ITEMS: AuthenticInventoryItem[] = Object.values(TANK_ITEM_CATALOG).map((item) => ({
  id: item.slug,
  name: item.name,
  quantity: 1,
  iconUrl: item.svgIcon || getTankItemIcon(item.slug),
  emoji: item.emoji,
  rarityColor: item.rarityColor,
  description: item.description,
}));

type SubModal = "none" | "market" | "craft" | "prize" | "slots";

export function InventoryOverlay({
  inventory = [],
  onClose,
  onOpenShop,
  targetRoomKey = null,
}: InventoryOverlayProps) {
  const [totalSlots, setTotalSlots] = useState(20);
  const [activeModal, setActiveModal] = useState<SubModal>("none");
  const [selectedItem, setSelectedItem] = useState<AuthenticInventoryItem | null>(null);
  const [craftSlot1, setCraftSlot1] = useState<AuthenticInventoryItem | null>(null);
  const [craftSlot2, setCraftSlot2] = useState<AuthenticInventoryItem | null>(null);
  const [prizeRolling, setPrizeRolling] = useState(false);
  const [prizeWon, setPrizeWon] = useState<string | null>(null);

  // Map real database items or fallback to DEFAULT_AUTHENTIC_ITEMS
  const items: AuthenticInventoryItem[] = inventory.length > 0
    ? inventory.map((entry) => {
        const rarity = entry.rarity?.toLowerCase() || "common";
        const rarityColor =
          rarity === "legendary"
            ? "#eab308"
            : rarity === "epic"
            ? "#a855f7"
            : rarity === "rare"
            ? "#3b82f6"
            : rarity === "uncommon"
            ? "#22c55e"
            : "none";

        const rawSlug = entry.slug || entry.itemId;
        const iconUrl = getTankItemIcon(rawSlug, entry.iconUrl);
        const emoji = getTankItemEmoji(rawSlug);

        return {
          id: entry.itemId,
          name: entry.name,
          quantity: entry.quantity,
          iconUrl,
          emoji,
          rarityColor,
          description: entry.description || undefined,
          slug: entry.slug,
          audioEffectType: entry.audioEffectType,
        };
      })
    : DEFAULT_AUTHENTIC_ITEMS;

  const emptySlotsCount = Math.max(0, totalSlots - items.length);

  const handleSpinPrizeMachine = async () => {
    if (prizeRolling) return;
    setPrizeRolling(true);
    setPrizeWon(null);
    try {
      const res = await spinTankPrizeMachine();
      setPrizeRolling(false);
      if (res.success && res.prize) {
        setPrizeWon(res.prize);
      } else {
        alert(res.error || "Failed to spin prize machine.");
      }
    } catch {
      setPrizeRolling(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Inventory"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg shadow-[0_12px_40px_rgba(0,0,0,0.9)]"
      >
        <ChromePanel withScrews className="w-full flex flex-col overflow-hidden">
          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-black/40 pb-3 px-1">
            <h2
              className="text-lg font-black text-white uppercase tracking-wider drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              Inventory
            </h2>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-1.5">
              {/* 1. Shop (Red) */}
              <button
                type="button"
                title="Shop"
                onClick={() => {
                  if (onOpenShop) onOpenShop();
                  else alert("Opening Shop...");
                }}
                className="grid h-8 w-8 place-items-center rounded bg-[#c0432a] text-white shadow hover:brightness-110 active:scale-95 border border-white/30"
              >
                <Store className="h-4 w-4" />
              </button>

              {/* 2. Trade Market (Yellow) */}
              <button
                type="button"
                title="Trade Market"
                onClick={() => setActiveModal(activeModal === "market" ? "none" : "market")}
                className={`grid h-8 w-8 place-items-center rounded bg-[#eab308] text-black shadow hover:brightness-110 active:scale-95 border border-black/30 ${
                  activeModal === "market" ? "ring-2 ring-yellow-400" : ""
                }`}
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>

              {/* 3. Crafting Workshop (Green) */}
              <button
                type="button"
                title="Crafting Workshop"
                onClick={() => setActiveModal(activeModal === "craft" ? "none" : "craft")}
                className={`grid h-8 w-8 place-items-center rounded bg-[#22c55e] text-black shadow hover:brightness-110 active:scale-95 border border-black/30 ${
                  activeModal === "craft" ? "ring-2 ring-emerald-400" : ""
                }`}
              >
                <Hammer className="h-4 w-4" />
              </button>

              {/* 4. Prize Machine (Cyan/Blue) */}
              <button
                type="button"
                title="Arcade Prize Machine"
                onClick={() => setActiveModal(activeModal === "prize" ? "none" : "prize")}
                className={`grid h-8 w-8 place-items-center rounded bg-[#06b6d4] text-black shadow hover:brightness-110 active:scale-95 border border-black/30 ${
                  activeModal === "prize" ? "ring-2 ring-cyan-300" : ""
                }`}
              >
                <Sparkles className="h-4 w-4" />
              </button>

              {/* 5. Increase Slots (Coral) */}
              <button
                type="button"
                title="Increase Inventory Slots"
                onClick={() => setActiveModal(activeModal === "slots" ? "none" : "slots")}
                className={`relative grid h-8 w-8 place-items-center rounded bg-[#f97316] text-white shadow hover:brightness-110 active:scale-95 border border-white/30 ${
                  activeModal === "slots" ? "ring-2 ring-orange-300" : ""
                }`}
              >
                <Package className="h-4 w-4" />
                <Plus className="absolute right-0.5 top-0.5 h-2.5 w-2.5 stroke-[3]" />
              </button>

              {/* Close Button */}
              <button
                type="button"
                title="Close"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded bg-[#e85a4f] text-white shadow hover:scale-105 active:scale-95 border border-white/40 ml-1"
              >
                <X className="h-4 w-4 stroke-[3]" />
              </button>
            </div>
          </div>

          {/* Sub-Modal Views (Trade Post, Crafting, Prize Machine, Increase Slots) */}
          {activeModal === "market" && (
            <div className="my-2 rounded-lg bg-black/80 p-3 border border-yellow-400/40 text-white animate-in fade-in">
              <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                <span className="text-xs font-black text-yellow-400 flex items-center gap-1.5">
                  <ArrowLeftRight className="h-4 w-4" /> Trade Post (Economy Bazaar)
                </span>
                <span className="text-[10px] text-slate-400">Live Peer-to-Peer Trades</span>
              </div>
              <p className="text-[11px] text-slate-300 my-2">
                Trade rare items with other viewers in real-time or sell unwanted drops for Tank tokens.
              </p>
              <div className="flex gap-2">
                <ConsoleButton variant="orange" className="flex-1 !py-1 text-xs" onClick={() => alert("Marketplace order book opening...")}>
                  Browse Listings
                </ConsoleButton>
                <ConsoleButton variant="gray" className="flex-1 !py-1 text-xs" onClick={() => alert("Select an item from inventory to list.")}>
                  List Item
                </ConsoleButton>
              </div>
            </div>
          )}

          {activeModal === "craft" && (
            <div className="my-2 rounded-lg bg-black/80 p-3 border border-emerald-400/40 text-white animate-in fade-in">
              <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                  <Hammer className="h-4 w-4" /> Workshop Craft Area
                </span>
                <span className="text-[10px] text-slate-400">Combine 2 Items</span>
              </div>
              <div className="flex items-center justify-center gap-3 my-3">
                <div
                  onClick={() => setCraftSlot1(null)}
                  className="h-14 w-14 rounded-lg bg-[#181a1f] border-2 border-dashed border-white/30 flex items-center justify-center cursor-pointer overflow-hidden p-1"
                >
                  {craftSlot1 ? (
                    <img src={craftSlot1.iconUrl} alt={craftSlot1.name} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-slate-400">Slot 1</span>
                  )}
                </div>
                <span className="text-sm font-black text-emerald-400">+</span>
                <div
                  onClick={() => setCraftSlot2(null)}
                  className="h-14 w-14 rounded-lg bg-[#181a1f] border-2 border-dashed border-white/30 flex items-center justify-center cursor-pointer overflow-hidden p-1"
                >
                  {craftSlot2 ? (
                    <img src={craftSlot2.iconUrl} alt={craftSlot2.name} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-slate-400">Slot 2</span>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
                <div className="h-14 w-14 rounded-lg bg-yellow-400/10 border-2 border-dashed border-yellow-400/40 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-yellow-400 animate-pulse" />
                </div>
              </div>
              <ConsoleButton
                variant="orange"
                disabled={!craftSlot1 || !craftSlot2}
                onClick={async () => {
                  if (!craftSlot1 || !craftSlot2) return;
                  const res = await craftTankFusion(craftSlot1.id, craftSlot2.id);
                  if (res.success && res.resultItem) {
                    alert(`Crafted: ${res.resultItem}!`);
                    setCraftSlot1(null);
                    setCraftSlot2(null);
                  } else {
                    alert(res.error || "Incompatible items for fusion.");
                  }
                }}
                className="w-full !py-1 text-xs"
              >
                Craft Fusion
              </ConsoleButton>
            </div>
          )}

          {activeModal === "prize" && (
            <div className="my-2 rounded-lg bg-black/80 p-3 border border-cyan-400/40 text-white animate-in fade-in text-center">
              <span className="text-xs font-black text-cyan-400 flex items-center justify-center gap-1.5 mb-1">
                <Sparkles className="h-4 w-4" /> Prize Machine (100 Tokens / Spin)
              </span>
              <p className="text-[11px] text-slate-300 mb-2">
                Spin the arcade prize machine for legendary drops and bonus tokens.
              </p>
              {prizeWon && (
                <div className="my-2 p-2 rounded bg-yellow-400/20 border border-yellow-400 text-yellow-300 font-bold text-xs">
                  🎉 You Won: {prizeWon}!
                </div>
              )}
              <ConsoleButton
                variant="orange"
                disabled={prizeRolling}
                onClick={handleSpinPrizeMachine}
                className="w-full !py-1.5 text-xs"
              >
                {prizeRolling ? "🎰 Rolling..." : "🎰 Spin Prize Machine"}
              </ConsoleButton>
            </div>
          )}

          {activeModal === "slots" && (
            <div className="my-2 rounded-lg bg-black/80 p-3 border border-orange-400/40 text-white animate-in fade-in text-center">
              <span className="text-xs font-black text-orange-400 flex items-center justify-center gap-1.5 mb-1">
                <Package className="h-4 w-4" /> Expand Inventory Capacity
              </span>
              <p className="text-[11px] text-slate-300 mb-2">
                Unlock +5 additional inventory slots for 250 Tokens. (Current: {totalSlots} slots)
              </p>
              <ConsoleButton
                variant="orange"
                onClick={() => {
                  setTotalSlots((prev) => prev + 5);
                  alert("Expanded inventory by +5 slots!");
                  setActiveModal("none");
                }}
                className="w-full !py-1.5 text-xs"
              >
                <Coins className="h-3.5 w-3.5 mr-1 inline" /> Expand +5 Slots (250 Tokens)
              </ConsoleButton>
            </div>
          )}

          {/* 5x4 Grid Container */}
          <div className="my-2 rounded-lg bg-[#0e1013] p-3 border border-black/80 shadow-inner">
            <div className="grid grid-cols-5 gap-2.5">
              {/* 1. Filled Authentic Items */}
              {items.map((item) => {
                const hasBorder = item.rarityColor !== "none";
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (activeModal === "craft") {
                        if (!craftSlot1) setCraftSlot1(item);
                        else if (!craftSlot2) setCraftSlot2(item);
                      } else {
                        setSelectedItem(item);
                      }
                    }}
                    className={`group relative aspect-square w-full cursor-pointer overflow-hidden rounded-xl bg-[#181a1f] p-1.5 shadow-[0_4px_8px_rgba(0,0,0,0.6)] transition-all hover:scale-105 active:scale-95 flex items-center justify-center ${
                      hasBorder
                        ? "border-2 shadow-[0_0_8px_rgba(34,197,94,0.3)]"
                        : "border border-white/15 hover:border-white/40"
                    }`}
                    style={{
                      borderColor: hasBorder ? item.rarityColor : undefined,
                    }}
                  >
                    {/* Centered High-Fidelity Item Image with Emoji Fallback */}
                    {item.iconUrl ? (
                      <img
                        src={item.iconUrl}
                        alt={item.name}
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.style.display = "none";
                          const fallback = target.nextElementSibling as HTMLElement | null;
                          if (fallback) fallback.style.display = "flex";
                        }}
                        className="h-full w-full object-contain pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] select-none"
                      />
                    ) : null}

                    {/* Emoji Fallback Badge */}
                    <div
                      className={`h-full w-full items-center justify-center text-2xl select-none pointer-events-none ${
                        item.iconUrl ? "hidden" : "flex"
                      }`}
                    >
                      {item.emoji || "📦"}
                    </div>

                    {/* Bottom-Right Quantity Badge */}
                    {item.quantity > 0 && (
                      <span className="absolute bottom-1 right-1.5 text-xs font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] select-none pointer-events-none font-mono">
                        {item.quantity}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* 2. Empty Rounded Inventory Slots */}
              {Array.from({ length: emptySlotsCount }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="aspect-square w-full rounded-xl bg-[#121417] border border-white/5 shadow-inner pointer-events-none"
                />
              ))}
            </div>
          </div>

          {/* Item Detail Inset (when an item is clicked) */}
          {selectedItem && (
            <div className="flex items-center justify-between rounded-lg bg-black/80 px-3 py-2 border border-white/10 text-white mt-1">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 shrink-0 flex items-center justify-center bg-[#181a1f] rounded border border-white/10 p-1">
                  {selectedItem.iconUrl ? (
                    <img src={selectedItem.iconUrl} alt={selectedItem.name} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-lg">{selectedItem.emoji || "📦"}</span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-black text-white">{selectedItem.name}</p>
                  <p className="text-[10px] text-slate-400">{selectedItem.description}</p>
                </div>
              </div>
              <ConsoleButton
                variant="orange"
                onClick={async () => {
                  const slug = selectedItem.slug || selectedItem.id;
                  const res = selectedItem.audioEffectType === "hazard_effect"
                    ? targetRoomKey
                      ? await fetch("/api/items/use-hazard", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ itemSlug: slug, roomKey: targetRoomKey }),
                        }).then(async (response) => {
                          const payload = await response.json() as { success?: boolean; error?: string };
                          return { success: response.ok && payload.success === true, error: payload.error };
                        })
                      : { success: false, error: "Open a physical room before using a room hazard." }
                    : await useTankItem(slug);
                  if (res.success) {
                    setSelectedItem(null);
                    onClose();
                  } else {
                    alert(res.error || `Used ${selectedItem.name}!`);
                    setSelectedItem(null);
                  }
                }}
                className="!px-3 !py-1 text-xs font-bold"
              >
                Use Item
              </ConsoleButton>
            </div>
          )}
        </ChromePanel>
      </div>
    </div>
  );
}

export default InventoryOverlay;
