"use client";

import React, { useState, useEffect } from "react";
import {
  ArrowLeftRight,
  Coins,
  Search,
  RotateCw,
  Clock,
  X,
  TrendingUp,
  Tag,
  ShoppingBag,
  Gavel,
  Check,
  AlertCircle,
  Package,
} from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { ACTIVE_THEME } from "../../theme";
import { TANK_ITEM_ICONS } from "../../tankItemCatalog";
import type { ItemRarity } from "../../itemRarity";
import {
  getMarketListings,
  createMarketListingAction,
  buyoutMarketListingAction,
  bidMarketListingAction,
  getMarketStatsAction,
} from "../../server/bazaarActions";
import { DEFAULT_MARKET_STATS, type MarketListingView, type MarketItemStat } from "../../bazaarMarketData";

export type InventoryItemSummary = {
  id: string;
  slug: string;
  name: string;
  rarity?: string;
  iconUrl?: string;
  quantity: number;
};

export type BazaarOverlayProps = {
  userTokens?: number;
  userInventory?: InventoryItemSummary[];
  onClose: () => void;
  onRefreshProfile?: () => void;
};

export function BazaarOverlay({
  userTokens = 0,
  userInventory = [],
  onClose,
  onRefreshProfile,
}: BazaarOverlayProps) {
  const [activeTab, setActiveTab] = useState<"buy" | "sell" | "stats">("buy");
  const [listings, setListings] = useState<MarketListingView[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRarity, setSelectedRarity] = useState("all");
  const [marketStats, setMarketStats] = useState<MarketItemStat[]>(DEFAULT_MARKET_STATS);
  const [statsSort, setStatsSort] = useState<"sold" | "high" | "low" | "name">("sold");

  // Sell Form State
  const [selectedSellItem, setSelectedSellItem] = useState<InventoryItemSummary | null>(null);
  const [sellStartBid, setSellStartBid] = useState<number>(1);
  const [sellBuyoutPrice, setSellBuyoutPrice] = useState<string>("");
  const [sellDuration, setSellDuration] = useState<number>(24);
  const [sellQuantity, setSellQuantity] = useState<number>(1);
  const [sellBusy, setSellBusy] = useState(false);
  const [sellMessage, setSellMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Buyout / Bid state
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [bidModalListing, setBidModalListing] = useState<MarketListingView | null>(null);
  const [bidAmountInput, setBidAmountInput] = useState<number>(1);

  // Fetch active listings
  const fetchListings = async () => {
    setLoadingListings(true);
    try {
      const data = await getMarketListings({
        search: searchQuery,
        rarity: selectedRarity,
      });
      setListings(data);
    } catch {}
    setLoadingListings(false);
  };

  useEffect(() => {
    if (activeTab === "buy") {
      void fetchListings();
    } else if (activeTab === "stats") {
      void getMarketStatsAction().then((stats) => setMarketStats(stats));
    }
  }, [activeTab, selectedRarity]);

  // Handle Buyout
  const handleBuyout = async (listing: MarketListingView) => {
    if (!listing.buyoutPrice) return;
    if (userTokens < listing.buyoutPrice) {
      alert(`Insufficient tokens! You need ₮${listing.buyoutPrice}, but have ₮${userTokens}.`);
      return;
    }
    if (!confirm(`Buyout ${listing.itemName} (x${listing.quantity}) for ₮${listing.buyoutPrice}?`)) return;

    setActionBusyId(listing.id);
    const res = await buyoutMarketListingAction(listing.id);
    setActionBusyId(null);

    if (res.success) {
      alert(`Successfully purchased ${listing.itemName}!`);
      void fetchListings();
      if (onRefreshProfile) onRefreshProfile();
    } else {
      alert(res.error || "Buyout failed.");
    }
  };

  // Handle Bid Submit
  const handleBidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bidModalListing) return;
    if (userTokens < bidAmountInput) {
      alert(`Insufficient tokens! You need ₮${bidAmountInput}, but have ₮${userTokens}.`);
      return;
    }

    setActionBusyId(bidModalListing.id);
    const res = await bidMarketListingAction({
      listingId: bidModalListing.id,
      bidAmount: bidAmountInput,
    });
    setActionBusyId(null);

    if (res.success) {
      alert(`Bid of ₮${bidAmountInput} placed on ${bidModalListing.itemName}!`);
      setBidModalListing(null);
      void fetchListings();
      if (onRefreshProfile) onRefreshProfile();
    } else {
      alert(res.error || "Failed to place bid.");
    }
  };

  // Handle Create Listing
  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSellItem) {
      setSellMessage({ type: "error", text: "Please select an item from your inventory below." });
      return;
    }

    setSellBusy(true);
    setSellMessage(null);

    const buyout = sellBuyoutPrice.trim() ? parseInt(sellBuyoutPrice.trim(), 10) : null;
    const res = await createMarketListingAction({
      itemSlug: selectedSellItem.slug,
      quantity: sellQuantity,
      startBid: sellStartBid,
      buyoutPrice: buyout && !isNaN(buyout) ? buyout : null,
      durationHours: sellDuration,
    });

    setSellBusy(false);

    if (res.success) {
      setSellMessage({ type: "success", text: `Listed ${selectedSellItem.name} (x${sellQuantity}) in the Bazaar!` });
      setSelectedSellItem(null);
      setSellBuyoutPrice("");
      setSellStartBid(1);
      setSellQuantity(1);
      if (onRefreshProfile) onRefreshProfile();
    } else {
      setSellMessage({ type: "error", text: res.error || "Failed to list item." });
    }
  };

  // Rarity color pills
  const getRarityBadge = (rarity: string = "common") => {
    switch (rarity.toLowerCase()) {
      case "mythic":
        return "bg-amber-500/20 text-amber-300 border-amber-500/60";
      case "legendary":
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500/60";
      case "epic":
        return "bg-purple-500/20 text-purple-300 border-purple-500/60";
      case "rare":
        return "bg-sky-500/20 text-sky-300 border-sky-500/60";
      case "uncommon":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/60";
      default:
        return "bg-slate-500/20 text-slate-300 border-slate-500/60";
    }
  };

  // Stats Sorting
  const sortedStats = [...marketStats].sort((a, b) => {
    if (statsSort === "high") return b.highPrice - a.highPrice;
    if (statsSort === "low") return a.lowPrice - b.lowPrice;
    if (statsSort === "name") return a.name.localeCompare(b.name);
    return b.amountSold - a.amountSold;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="Night Bazaar"
    >
      {/* Click-away backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />

      {/* Floating Panel Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto relative flex w-full max-w-[420px] sm:max-w-[460px] max-h-[92vh] flex-col overflow-hidden animate-in zoom-in-95 duration-200"
      >
        <ChromePanel
          withScrews
          className="flex h-full w-full flex-col overflow-hidden shadow-2xl"
          contentClassName="!p-0 flex flex-1 flex-col overflow-hidden"
        >
          {/* ═══════════ TOP HEADER: TITLE, BALANCE, CLOSE ═══════════ */}
          <div className="px-7 pt-4 pb-3 border-b border-black/40 bg-[#252830]">
            <div className="flex items-center justify-between">
              <h2
                className="text-sm font-black uppercase tracking-wider text-[#241f14] flex items-center gap-2"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                <ArrowLeftRight className="h-4 w-4 text-[#ff4d00]" />
                Wet Market
              </h2>

              <div className="flex items-center gap-2">
                {/* Balance Pill */}
                <div className="flex items-center gap-1 px-2.5 py-1 rounded border border-black/60 bg-[#16181d] shadow-inner">
                  <span className="text-[10px] font-bold text-slate-400">Balance</span>
                  <span className="text-xs font-black text-[#39ff6a]">₮ {userTokens}</span>
                </div>

                {/* Close Button */}
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="grid h-7 w-7 place-items-center rounded border border-black/40 bg-[#e85a4f] text-white shadow hover:brightness-110 active:scale-95 cursor-pointer"
                >
                  <X className="h-4 w-4 stroke-[3]" />
                </button>
              </div>
            </div>

            {/* 3 Main Navigation Tabs */}
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => setActiveTab("buy")}
                className={`flex-1 py-1.5 px-3 rounded font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition border cursor-pointer ${
                  activeTab === "buy"
                    ? "bg-[#e85a4f] text-white border-black/60 shadow"
                    : "bg-[#1c1f26] text-slate-400 border-white/5 hover:text-white"
                }`}
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                Buy
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("sell")}
                className={`flex-1 py-1.5 px-3 rounded font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition border cursor-pointer ${
                  activeTab === "sell"
                    ? "bg-[#e85a4f] text-white border-black/60 shadow"
                    : "bg-[#1c1f26] text-slate-400 border-white/5 hover:text-white"
                }`}
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                <Tag className="h-3.5 w-3.5" />
                Sell
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("stats")}
                className={`flex-1 py-1.5 px-3 rounded font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition border cursor-pointer ${
                  activeTab === "stats"
                    ? "bg-[#e85a4f] text-white border-black/60 shadow"
                    : "bg-[#1c1f26] text-slate-400 border-white/5 hover:text-white"
                }`}
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Stats
              </button>
            </div>
          </div>

          {/* ═══════════ TAB 1: BUY (MARKET LISTINGS FEED) ═══════════ */}
          {activeTab === "buy" && (
            <div className="flex-1 flex flex-col overflow-hidden bg-[#121418]">
              {/* Search and Filters Bar */}
              <div className="p-3 border-b border-black/40 bg-[#181a20] flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search the wet market..."
                    className="w-full h-8 pl-8 pr-3 rounded border border-black/60 bg-[#0d0e12] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-yellow-400 shadow-inner"
                  />
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                </div>

                {/* Rarity Select */}
                <select
                  value={selectedRarity}
                  onChange={(e) => setSelectedRarity(e.target.value)}
                  className="h-8 px-2 rounded border border-black/60 bg-[#0d0e12] text-xs font-bold text-slate-300 focus:outline-none focus:border-yellow-400 cursor-pointer"
                >
                  <option value="all">All</option>
                  <option value="common">Common</option>
                  <option value="uncommon">Uncommon</option>
                  <option value="rare">Rare</option>
                  <option value="epic">Epic</option>
                  <option value="legendary">Legendary</option>
                  <option value="mythic">Mythic</option>
                </select>

                <button
                  type="button"
                  onClick={fetchListings}
                  title="Search & Refresh"
                  className="grid h-8 w-8 place-items-center rounded border border-black/60 bg-[#e85a4f] text-white shadow hover:brightness-110 active:scale-95 cursor-pointer"
                >
                  <Search className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={fetchListings}
                  title="Refresh Listings"
                  className="grid h-8 w-8 place-items-center rounded border border-black/60 bg-[#2d313b] text-slate-300 hover:text-white shadow hover:brightness-110 active:scale-95 cursor-pointer"
                >
                  <RotateCw className={`h-3.5 w-3.5 ${loadingListings ? "animate-spin" : ""}`} />
                </button>
              </div>

              {/* Listings Scrollable Feed */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {listings.length === 0 ? (
                  <div className="py-20 text-center space-y-3 px-4">
                    <div className="grid h-12 w-12 place-items-center rounded-full bg-white/5 border border-white/10 mx-auto text-slate-500">
                      <ShoppingBag className="h-6 w-6" />
                    </div>
                    <p className="text-xs font-bold text-slate-400">
                      No active listings in the Bazaar right now.
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Switch to the <span className="text-orange-400 font-bold">Sell</span> tab to list items from your inventory!
                    </p>
                  </div>
                ) : (
                  listings.map((l) => {
                    const icon = TANK_ITEM_ICONS[l.itemSlug] || l.itemIconUrl;
                    return (
                      <div
                        key={l.id}
                        className="rounded-lg border border-slate-700/60 bg-[#1c1f26] p-3 shadow-md hover:border-yellow-400/80 transition flex items-center justify-between gap-3"
                      >
                        {/* Left: Thumbnail & Details */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative h-12 w-12 rounded-lg bg-black/80 border border-white/10 p-1 flex items-center justify-center shrink-0">
                            <img src={icon} alt={l.itemName} className="h-full w-full object-contain" />
                            <span className="absolute -bottom-1 -right-1 bg-black text-[10px] font-black px-1.5 rounded border border-white/20 text-white">
                              {l.quantity}
                            </span>
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] font-black uppercase px-1.5 py-0.2 rounded border ${getRarityBadge(l.itemRarity)}`}>
                                {l.itemName}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">
                              @{l.sellerName}
                            </p>
                            <div className="flex items-center gap-1 text-[10px] text-amber-400 font-bold">
                              <Clock className="h-3 w-3" />
                              <span>Ending soon</span>
                            </div>
                          </div>
                        </div>

                        {/* Right: Buyout & Bid Actions */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {l.buyoutPrice !== null && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-[#39ff6a]">₮ {l.buyoutPrice}</span>
                              <button
                                type="button"
                                disabled={actionBusyId === l.id}
                                onClick={() => handleBuyout(l)}
                                className="px-3 py-1 rounded bg-[#22c55e] hover:bg-[#16a34a] text-black font-black text-xs uppercase tracking-wider transition active:scale-95 shadow cursor-pointer"
                              >
                                Buyout
                              </button>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-sky-400">
                              ₮ {l.currentBid ?? l.startBid}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setBidModalListing(l);
                                setBidAmountInput((l.currentBid ?? l.startBid) + 1);
                              }}
                              className="px-3 py-1 rounded bg-[#3b82f6] hover:bg-[#2563eb] text-white font-black text-xs uppercase tracking-wider transition active:scale-95 shadow cursor-pointer"
                            >
                              Bid
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ═══════════ TAB 2: SELL (CREATE LISTING FORM) ═══════════ */}
          {activeTab === "sell" && (
            <div className="flex-1 flex flex-col overflow-hidden bg-[#121418] p-3.5 space-y-3">
              {sellMessage && (
                <div className={`p-2.5 rounded text-xs font-bold flex items-center gap-2 ${
                  sellMessage.type === "success" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-red-500/20 text-red-300 border border-red-500/40"
                }`}>
                  {sellMessage.type === "success" ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  <span>{sellMessage.text}</span>
                </div>
              )}

              {/* Form Container */}
              <form onSubmit={handleCreateListing} className="rounded-lg border border-black/60 bg-[#1c1f26] p-3.5 space-y-3 shadow-inner">
                <div className="flex gap-3">
                  {/* Selected Item Preview Box */}
                  <div className="h-20 w-20 rounded-lg border-2 border-dashed border-white/20 bg-black/60 flex flex-col items-center justify-center p-1 shrink-0">
                    {selectedSellItem ? (
                      <>
                        <img
                          src={TANK_ITEM_ICONS[selectedSellItem.slug] || selectedSellItem.iconUrl || "/images/tank-items/battery.png"}
                          alt={selectedSellItem.name}
                          className="h-10 w-10 object-contain"
                        />
                        <span className="text-[9px] font-black text-white truncate max-w-[70px] mt-1">
                          {selectedSellItem.name}
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] text-center text-slate-500 font-bold">
                        Select Item Below
                      </span>
                    )}
                  </div>

                  {/* Start Bid & Buyout Price Inputs */}
                  <div className="flex-1 space-y-2">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400">Start Bid (₮)</label>
                      <input
                        type="number"
                        min="1"
                        value={sellStartBid}
                        onChange={(e) => setSellStartBid(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full h-7 px-2 rounded border border-black/60 bg-[#0d0e12] text-xs font-black text-white focus:outline-none focus:border-yellow-400"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400">Buyout Price (₮ - Optional)</label>
                      <input
                        type="number"
                        min={sellStartBid}
                        value={sellBuyoutPrice}
                        onChange={(e) => setSellBuyoutPrice(e.target.value)}
                        placeholder="Instant buyout"
                        className="w-full h-7 px-2 rounded border border-black/60 bg-[#0d0e12] text-xs font-black text-emerald-400 focus:outline-none focus:border-yellow-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Duration & Quantity Rows */}
                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-white/5">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Duration</label>
                    <div className="flex items-center gap-1.5">
                      {[12, 24, 48].map((hours) => (
                        <button
                          key={hours}
                          type="button"
                          onClick={() => setSellDuration(hours)}
                          className={`flex-1 py-1 text-[10px] font-black rounded border transition cursor-pointer ${
                            sellDuration === hours
                              ? "bg-[#e85a4f] text-white border-black/40 shadow"
                              : "bg-black/60 text-slate-400 border-white/5"
                          }`}
                        >
                          {hours}h
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-black uppercase text-slate-400">Quantity</label>
                      {selectedSellItem && (
                        <span className="text-[9px] text-slate-500 font-bold">(Max {selectedSellItem.quantity})</span>
                      )}
                    </div>
                    <input
                      type="number"
                      min="1"
                      max={selectedSellItem?.quantity || 1}
                      value={sellQuantity}
                      onChange={(e) => setSellQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full h-7 px-2 rounded border border-black/60 bg-[#0d0e12] text-xs font-black text-white focus:outline-none focus:border-yellow-400"
                    />
                  </div>
                </div>

                {/* Deposit & Action Button */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <div className="text-[11px] font-bold text-slate-400">
                    Deposit: <span className="text-[#39ff6a] font-black">₮ 0</span>
                  </div>

                  <button
                    type="submit"
                    disabled={sellBusy || !selectedSellItem}
                    className="px-6 py-2 rounded bg-gradient-to-b from-[#f26d4b] to-[#c84423] text-white font-black text-xs uppercase tracking-wider shadow hover:brightness-110 active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {sellBusy ? "Listing..." : "Sell Item"}
                  </button>
                </div>
              </form>

              {/* Bottom Inventory Drawer (Select Item to Sell) */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-yellow-400" />
                  Your Backpack (Tap an item to list)
                </span>

                <div className="flex-1 overflow-y-auto rounded-lg border border-black/60 bg-black/50 p-2.5 grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-[160px]">
                  {userInventory.length === 0 ? (
                    <div className="col-span-full py-8 text-center text-xs text-slate-500 font-bold">
                      Your inventory is empty. Complete quests to earn items!
                    </div>
                  ) : (
                    userInventory.map((item) => {
                      const icon = TANK_ITEM_ICONS[item.slug] || item.iconUrl || "/images/tank-items/battery.png";
                      const isSelected = selectedSellItem?.id === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSelectedSellItem(item);
                            setSellQuantity(1);
                          }}
                          className={`relative rounded-lg p-1.5 flex flex-col items-center justify-center transition border cursor-pointer ${
                            isSelected
                              ? "bg-orange-500/20 border-orange-500 ring-2 ring-orange-500/50 scale-105"
                              : "bg-[#181a20] border-white/10 hover:border-yellow-400/80 hover:bg-[#20232a]"
                          }`}
                        >
                          <img src={icon} alt={item.name} className="h-8 w-8 object-contain" />
                          <span className="text-[9px] font-black text-white truncate max-w-[60px] text-center mt-1">
                            {item.name}
                          </span>
                          <span className="absolute top-1 right-1 bg-black text-[8px] font-black px-1 rounded text-slate-300 border border-white/20">
                            {item.quantity}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ TAB 3: STATS (MARKET PRICE HISTORY) ═══════════ */}
          {activeTab === "stats" && (
            <div className="flex-1 flex flex-col overflow-hidden bg-[#121418]">
              {/* Stats Filter & Header */}
              <div className="p-3 border-b border-black/40 bg-[#181a20] flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400">
                  Updated Live Ledger
                </span>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400">Sort by</span>
                  <select
                    value={statsSort}
                    onChange={(e) => setStatsSort(e.target.value as any)}
                    className="h-7 px-2 rounded border border-black/60 bg-[#0d0e12] text-[11px] font-bold text-slate-300 focus:outline-none focus:border-yellow-400 cursor-pointer"
                  >
                    <option value="sold">Amount Sold</option>
                    <option value="high">Highest Price</option>
                    <option value="low">Lowest Price</option>
                    <option value="name">Name</option>
                  </select>
                </div>
              </div>

              {/* Stats List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {sortedStats.map((stat) => {
                  const icon = TANK_ITEM_ICONS[stat.slug] || stat.iconUrl;
                  return (
                    <div
                      key={stat.slug}
                      className="rounded-lg border border-slate-800 bg-[#1c1f26] p-2.5 flex items-center justify-between gap-3 shadow-sm hover:border-slate-700 transition"
                    >
                      {/* Left: Thumbnail & Name */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="h-9 w-9 rounded bg-black/80 border border-white/10 p-1 flex items-center justify-center shrink-0">
                          <img src={icon} alt={stat.name} className="h-full w-full object-contain" />
                        </div>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border truncate ${getRarityBadge(stat.rarity)}`}>
                          {stat.name}
                        </span>
                      </div>

                      {/* Right Columns: High, Low, Avg, Sold */}
                      <div className="flex items-center gap-3 shrink-0 text-right">
                        <div className="min-w-[45px]">
                          <span className="text-[9px] text-slate-500 block">High</span>
                          <span className="text-[11px] font-black text-[#39ff6a]">₮ {stat.highPrice}</span>
                        </div>
                        <div className="min-w-[40px]">
                          <span className="text-[9px] text-slate-500 block">Low</span>
                          <span className="text-[11px] font-black text-[#39ff6a]">₮ {stat.lowPrice}</span>
                        </div>
                        <div className="min-w-[40px]">
                          <span className="text-[9px] text-slate-500 block">Avg</span>
                          <span className="text-[11px] font-black text-[#39ff6a]">₮ {stat.avgPrice}</span>
                        </div>
                        <div className="min-w-[40px]">
                          <span className="text-[9px] text-slate-500 block">Sold</span>
                          <span className="text-[11px] font-black text-amber-400">{stat.amountSold}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══════════ MODAL: PLACE BID PROMPT ═══════════ */}
          {bidModalListing && (
            <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <form
                onSubmit={handleBidSubmit}
                className="w-full max-w-[300px] rounded-lg border border-black/80 bg-[#1e222b] p-4 shadow-2xl space-y-3 animate-in zoom-in-95"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-xs font-black uppercase text-white flex items-center gap-1.5">
                    <Gavel className="h-3.5 w-3.5 text-sky-400" />
                    Place Bid
                  </span>
                  <button
                    type="button"
                    onClick={() => setBidModalListing(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <p className="text-xs text-slate-300 font-bold">
                  Bidding on <span className="text-yellow-400">{bidModalListing.itemName}</span>
                </p>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Bid Amount (Min: ₮{(bidModalListing.currentBid ?? bidModalListing.startBid) + 1})
                  </label>
                  <input
                    type="number"
                    min={(bidModalListing.currentBid ?? bidModalListing.startBid) + 1}
                    max={userTokens}
                    value={bidAmountInput}
                    onChange={(e) => setBidAmountInput(parseInt(e.target.value) || 1)}
                    className="w-full h-8 px-2 rounded border border-black/60 bg-[#0d0e12] text-sm font-black text-sky-400 focus:outline-none focus:border-sky-400"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setBidModalListing(null)}
                    className="flex-1 py-1.5 rounded bg-slate-700 text-white font-bold text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionBusyId === bidModalListing.id}
                    className="flex-1 py-1.5 rounded bg-sky-500 hover:bg-sky-600 text-white font-black text-xs uppercase shadow"
                  >
                    {actionBusyId === bidModalListing.id ? "Bidding..." : "Confirm Bid"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </ChromePanel>
      </div>
    </div>
  );
}

export default BazaarOverlay;
