# Tank Night Bazaar (Wet Market) P2P Trading Architecture

**Document ID**: `tank-night-bazaar-marketplace`  
**Status**: Master Feature & Engineering Specification  
**Domain**: Peer-to-Peer Economy, Escrow Auctions, Market Analytics, Secondary Item Trading  
**Zone**: `tank.unenter.live` (`src/zones/tank`)  

---

## 1. Executive Summary

The **Night Bazaar** (also known as the *Wet Market* in stream lore) is the player-to-player secondary marketplace on `tank.unenter.live`. It allows viewers to buy, bid on, and sell rare collected items, gadgets, and loot with Tank tokens.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 NIGHT BAZAAR (WET MARKET)                                   │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│  Balance: ₮ 477                                                                     [ X ]   │
│  [ ⇅ Buy ]                        [ ⇈ Sell ]                        [ 📈 Stats ]            │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│  🔍 Search market...               Rarity: [ All ▼ ]                 [ 🔍 ] [ 🔄 ]          │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│  • 🦶 Foot-Detector 3000 (x1)     @SadamsLeftFoot       ⏱ 02:58:34  ₮ 850 Buyout  [ Buyout ]│
│    (✨ LEGENDARY)                                                    ₮ 150 Bid     [  Bid   ]│
│                                                                                             │
│  • 👑 Royal Jelly (x1)            @Tyler                ⏱ 03:19:48  ₮ 320 Buyout  [ Buyout ]│
│    (✨ LEGENDARY)                                                    ₮  80 Bid     [  Bid   ]│
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Functional Architecture

### 2.1 Tab 1: `[ ⇅ Buy ]` (Active Market Order Book)
- Real-time listings feed displaying seller username, item icon, quantity, rarity pill, and time remaining.
- Search filter by keyword and rarity dropdown (`All`, `Common`, `Uncommon`, `Rare`, `Epic`, `Legendary`, `Mythic`).
- Dual Transaction Options:
  - **Instant Buyout (`[ Buyout ]`)**: Deducts the fixed buyout price, transfers item immediately to buyer inventory, and pays seller 95% (5% deflationary burn).
  - **Auction Bidding (`[ Bid ]`)**: Places a competitive bid held in escrow. Automatically refunds previous highest bidders when outbid.

### 2.2 Tab 2: `[ ⇈ Sell ]` (Create Listing Form + Inventory Drawer)
- **Zero Typing of Slugs**: Users don't need to manually type item names or codes.
- **1-Tap Inventory Selection**: The player's backpack is rendered in a clean grid below the form. Tapping any item automatically populates the listing card and caps max quantity!
- **Configurable Parameters**:
  - `Start Bid` (₮)
  - `Buyout Price` (₮ - optional instant purchase)
  - `Duration` (12h, 24h, 48h)
  - `Quantity` (1 to Max owned)
  - `Deposit: ₮ 0` (Zero upfront deposit friction)

### 2.3 Tab 3: `[ 📈 Stats ]` (Live Historical Price Index)
- Complete catalog benchmark index showing market statistics across all stream items:
  - `High ₮`: Highest price recorded for the item.
  - `Low ₮`: Lowest historical transaction.
  - `Avg ₮`: Volume-weighted average market price.
  - `Sold`: Total lifetime volume sold.
- Sortable by `Amount Sold`, `Highest Price`, `Lowest Price`, and `Name`.
- Provides full price context so users and admins can gauge the value of any item without needing to add every item to an admin account first.

---

## 3. Database Escrow & Atomic Settlement

All transactions run inside Postgres transaction blocks (`SECURITY DEFINER` RPCs with `FOR UPDATE` row-level locks):
1. `tank_create_market_listing(...)`: Escrows item from player inventory into `tank_market_listings`.
2. `tank_buyout_market_listing(...)`: Atomically transfers tokens, refunds previous bids, and credits item to buyer.
3. `tank_bid_market_listing(...)`: Holds bid tokens in escrow and auto-refunds prior outbid users.
