# 🏆 Fishtank Experience: Master Feature Roadmap & Architecture Register

This living document tracks all completed features, active implementations, and proposed innovations across our self-hosted streaming platform, interactive chat gamification, autonomous director, and infrastructure telemetry.

---

## 📌 Status Legend
- ✅ **VERIFIED / LIVE**: Built, deployed, and tested on production.
- 🟡 **CODE YELLOW / PENDING VERIFICATION**: Built and deployed, awaiting final physical hardware test.
- 🔄 **IN PROGRESS**: Active engineering and implementation.
- 💡 **BACKLOG / PLANNED**: Fully specified and queued for execution.

---

## 1. 📡 Universal Streaming & Edge Infrastructure

| Item | Feature / Component | Status | Description |
| :--- | :--- | :---: | :--- |
| **1.1** | **Dual-Output Audio Matrix** | ✅ LIVE | FFmpeg produces Opus for WebRTC WHEP (<500ms) and AAC-LC (`mp4a.40.2`) for Apple Native HLS simultaneously. |
| **1.2** | **Standard fMP4 HLS Transmuxing** | ✅ LIVE | Converted MediaMTX from Low-Latency HLS to standard 4s fMP4 HLS with embedded `?session=` params for AVFoundation cookie-less playback. |
| **1.3** | **720p Cellular ABR Ladder** | 🔄 IN PROGRESS | Transcodes raw 4K (8.4 Mbps) to 720p60 (2.2 Mbps) mobile rung, reducing segment size by 85% for smooth cellular playback. |
| **1.4** | **Bounded Native HLS Auto-Retry** | ✅ LIVE | Exponential retry on initial HLS manifest 404s (1.5s, 3s, 4.5s, 6s) eliminating the need for manual page refreshes. |
| **1.5** | **Zero-Blackout Dual-Buffer Surface** | ✅ LIVE | Hardware-accelerated buffer swap (Buffer A / B) with CRT transition glitch masking during camera cuts. |
| **1.6** | **Nginx 128k/256k Buffer Upgrade** | ✅ LIVE | Applied across all 15 NPM proxy hosts to prevent 502 Bad Gateway on large multi-zone cookie/JWT headers. |
| **1.7** | **Coturn TURN-over-TLS (Port 443)** | 💡 PLANNED | Self-hosted WebRTC TCP/TLS relay on port 443 to pierce symmetric corporate and carrier firewalls. |
| **1.8** | **Nginx RAM-Disk HLS Caching (`tmpfs`)**| 💡 PLANNED | `/dev/shm/nginx_hls_cache` RAM-disk zero-disk I/O caching for fMP4 `.m4s` segments to sustain 50,000+ viewers without NVMe wear. |
| **1.9** | **Client Network & Signal Quality HUD** | ✅ LIVE | Real-time `navigator.connection` & dropped frame detector displaying on-screen 📶 signal bars (e.g. 1-bar 5G low bandwidth warning) with auto-downscaling. |

---

## 2. ⏯️ DVR Timeshift, Pause/Play & Live Edge Sync

| Item | Feature / Component | Status | Description |
| :--- | :--- | :--- | :--- |
| **2.1** | **60–120s Sliding HLS Buffer** | 🔄 IN PROGRESS | MediaMTX maintains rolling fMP4 segment sliding window for seamless scrubbing and rewind. |
| **2.2** | **Interactive "🔴 Back to LIVE" Badge** | ✅ LIVE | Dynamic HUD badge tracking latency relative to real-time (`LIVE -XXs`) with 1-click snap to `seekable.end(0)`. |
| **2.3** | **Micro-Seek & Scrub Controls** | ✅ LIVE (dev) | Interactive timeline scrub bar with `-15s / +15s` skip triggers, buffered duration gradient fill, and live pin. |
| **2.4** | **Dynamic Catch-Up Playback Modulation**| ✅ LIVE (dev) | Smooth $1.08\times$ playback rate acceleration when behind by $3.5\text{s} < \Delta_{\text{live}} \le 15\text{s}$ to silently restore real-time sync without audio pitch shifts. |
| **2.5** | **Stale Buffer Auto-Catchup** | ✅ LIVE | Automatically fast-forwards to live edge when unpausing beyond the evicted sliding window. |
| **2.6** | **Tap-to-Unmute iOS Overlay** | ✅ LIVE | Handles WebKit autoplay policies gracefully with unmuted audio playback on user touch. |

---

## 3. 🛡️ Storage, Quota & App Resilience

| Item | Feature / Component | Status | Description |
| :--- | :--- | :---: | :--- |
| **3.1** | **`safeStorage` Auto-Eviction Adapter**| ✅ LIVE | Intercepts `QuotaExceededError` (code 22/1014), purges non-essential cache keys, and falls back to in-memory storage so Auth never crashes. |
| **3.2** | **Imgproxy Optimization Chokepoint** | ✅ LIVE | Transforms 3–5 MB raw storage images into ~50 KB WebP variants on `src/lib/images.ts`. |
| **3.3** | **Storage Footprint Cleaner** | 🔄 IN PROGRESS | Sweeps stale localStorage entries across all 6 multi-zones on initial app hydration. |

---

## 4. 🎮 Chat Gamification, Living Hivemind & The Night Bazaar

| Item | Feature / Component | Status | Description |
| :--- | :--- | :---: | :--- |
| **4.1** | **Sticky Pinned Poll Bar & Quick Jump**| ✅ LIVE | Real-time community voting card with percentage fill bars, live countdown timer, and floating jump button. |
| **4.2** | **16 D&D Subclass Archetypes** | ✅ LIVE | Chatters choose classes with active passives (Berserker, Paladin, Blade Dancer, Skald, etc.). |
| **4.3** | **Item Inventory & SVG Artifact Drops** | ✅ LIVE | 12 interactive items (Lightsaber, Royal Jelly, Launch Keys, Battery, Didgeridoo) unboxable from mystery crates. |
| **4.4** | **The Night Bazaar (P2P Barter System)**| 💡 PLANNED | Non-custodial multi-asset escrow (Items, Tokens, XP Vouchers) with row-locked atomic Postgres RPC settlement and a 5% deflationary token burn. |
| **4.5** | **The Living Hivemind (Hunger & Mood State)**| 💡 PLANNED | Autonomous hivemind state machine (Starving → Hungry → Content → Sated → Ascended) driving dynamic server-wide multipliers ($0.75\times$ to $2.0\times$ XP/tokens). |
| **4.6** | **Chat Food Buffs & Sacrificial Burning** | 💡 PLANNED | `/feed <item_slug>` and `/tithe <tokens>` commands to satisfy Hivemind hunger, trigger atmospheric CRT shaders, and grant community aura buffs. |
| **4.7** | **World Raid Boss Encounters** | 💡 PLANNED | Chaos bosses spawn in chat with 5,000 HP; chatters battle with `/attack`, `/smite`, `/heal` to split rare loot. |
| **4.8** | **Clan Territory & Room Domination** | 💡 PLANNED | Clan chat activity claims physical room dominance (Living Room, Kitchen, Game Room) with custom clan banners. |

---

## 5. 🎬 Autonomous Director & Multi-Camera Studio

| Item | Feature / Component | Status | Description |
| :--- | :--- | :---: | :--- |
| **5.1** | **Live Director Attention Lock** | ✅ LIVE | Admins & staff lock camera focus to IRL streams or specific rooms for 5m, 15m, 30m, 60m, 120m, or Indefinite. |
| **5.2** | **Multi-Stream Picture-in-Picture (PiP)**| 💡 PLANNED | Renders IRL backpack stream on primary stage with active room camera in retro top-right CRT inset. |
| **5.3** | **Quad-Cam Multi-Angle Matrix** | 💡 PLANNED | Expands director feed into synchronized 4-camera grid during multi-room house chaos. |
| **5.4** | **Director Discernment Tuning** | ✅ LIVE | Paced room dwell timers and intelligent speech-weighted camera switching. |

---

## 6. 🩺 Automated Telemetry & Self-Healing Watchdogs

| Item | Feature / Component | Status | Description |
| :--- | :--- | :--- | :--- |
| **6.1** | **Client Video Stagnation Watchdog** | ✅ LIVE (dev) | Detects stalled or frozen video frames for $>4.5$s and triggers silent self-healing stream recovery. |
| **6.2** | **Supabase Ingest Health Telemetry** | 💡 PLANNED | Continuous $2.0\text{s}$ time-series ingestion of bitrate, RTT, packet loss, and GOP cadence. |
| **6.3** | **Automated Scene & Ingest Failover** | 💡 PLANNED | Autonomous watchdog cuts director focus to backup camera and switches to SRTLA bonded lines upon sustained degradation ($>6\text{s}$). |
| **6.4** | **Code Yellow Protocol Compliance** | ✅ LIVE | Strict invariant: Client-unreplicatable mobile/hardware issues remain unverified until human operator confirmation. |

---

## 7. 🐒 DevTools Chaos Monkey Simulation Matrix & Adaptive Bandwidth (ABR)

| Profile | DevTools Throttling Preset | Downlink | RTT | Adaptive Shield & Player Strategy |
| :--- | :--- | :---: | :---: | :--- |
| **📶 1-Bar Cellular Edge** | Custom: `350 kbps`, `800ms RTT` | `350 kbps` | `800 ms` | Switches to **360p Low-Bandwidth Rung** (120 KB chunks), expands buffer margin to 8s, throttles background chat polls. |
| **📶 2-Bar / 3G / Fair** | Preset: `Slow 3G` / `Fast 3G` | `1.5 Mbps` | `250 ms` | Selects **720p Mobile Rung** (450 KB chunks), maintains 60s sliding DVR window with zero buffer stalls. |
| **📶 4G / LTE Regular** | Custom: `10 Mbps`, `60ms RTT` | `10 Mbps` | `60 ms` | Unlocks **1080p Full HD** fMP4 HLS / WHEP with crystal audio and full interactive chat. |
| **📶 5G / Wi-Fi 5 / Wi-Fi 6** | Preset: `Fast 4G` / Unthrottled | `50+ Mbps` | `25 ms` | Ultra-low latency **WebRTC WHEP (<400ms)** and full 4K bitrate streaming. |
| **⚡ Wi-Fi 7 / 10G LAN** | Unthrottled | `100+ Mbps` | `<5 ms` | Maximum 4K 60fps raw bitrate with instant sub-frame switching. |

