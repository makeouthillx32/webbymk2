# Tank camera + room onboarding

Written 2026-08-15, alongside the room-derivation pass (`supabase/migrations/20260815220000_tank_rooms_presentation.sql`,
`src/zones/tank/server/roomProjection.ts`).

## The one rule

**A room is never something you create — it's something that appears because a camera exists.**

There is no "add room" button anywhere, on purpose. `src/zones/tank/server/roomProjection.ts#deriveRooms`
groups every publicly-visible camera by its `roomScope` and produces one room
per distinct scope, live, on every poll. Give a camera a `roomScope` nobody's
used before and a new room shows up automatically; retire every camera in a
room and the room stops existing (or shows "no signal", depending on policy —
see below). This is what fixes the old "Game Room 2 exists with zero cameras"
problem: that was only possible because rooms used to be a hand-maintained
## Preflight: Physical Camera Discovery & Configuration ("New Cam to be Discovered")

Before registering a physical camera in `srt_receiver`:

1. **Physical Factory Reset**:
   - Hold physical reset button/pin on the camera unit (10–15 seconds) until power cycles to return to factory out-of-the-box defaults.
2. **Network Discovery & Scan**:
   - Locate the uninitialized camera on the LAN (defaults to e.g. `192.168.1.108` or pulls DHCP from `192.168.50.1`).
3. **Network Normalization**:
   - Assign static IP in the platform subnet: `192.168.50.x` (e.g. `.68`, `.69`, `.70` following `.65`, `.66`, `.67`).
   - Gateway: `192.168.50.1`, Subnet: `255.255.255.0`, DNS: `192.168.50.1` / `8.8.8.8`.
   - Set standard credentials: user `admin`, password `tank.unenter.live` (or dedicated camera user).
4. **DSP & Stream Optimization (Raw Clean Stream)**:
   - **Disable Noise Filter**: Turn OFF 3D/2D DNR / noise reduction filters to eliminate latency, ghosting, and smearing in motion.
   - **Disable Basic Overlays (OSD)**: Turn OFF camera native date/time stamp, camera title, channel name, and watermark overlays. (Tank renders dynamic, themed in-browser OSDs and telemetry overlays; clean video feed is required).
   - **Encode Standards**: Main stream H.264 (or compatible), 1080p/4K, 30/60fps, CBR/stable VBR, GOP / Keyframe interval = 1s–2s (30/60 frames) for instant segment slicing.

## Two source types, two onboarding paths

Both go through `srt_receiver` (`Z:\server\srt_receiver`, the SRT/SRTLA/RTSP/RTMP
receiver manager — outside this git repo, its own tool). Open its UI at
`http://192.168.50.204:5050`, "Add camera receiver."

### 1. IP camera (RTSP)

Pick **"LAN IP camera (RTSP)"**. Fill in the camera's LAN IP, RTSP port
(usually 554), a dedicated camera account (not the camera's admin login —
per the existing convention, e.g. `tankcam`), and the RTSP path (Dahua-style
units use `/cam/realmonitor?channel=1&subtype=0`, check the camera's own
docs otherwise). Set **Tank room scope** to the room you want it in —
lowercase, kebab-case (`game-room`, `hallway`, `kitchen`). Test the login
before saving to avoid retry lockouts.

Rooms containing at least one fixed IP camera default to **always-show**:
the room stays visible even when that camera is offline, rendered as
"no signal" rather than disappearing. That's deliberate — you want to *see*
a dead camera, not have it silently vanish from the site.

**2026-08-16 correction**: SRT/SRTLA used to be grouped into always-show
alongside IP cameras — that was wrong and made an empty "Roaming" room
(a SRTLA phone/portable slot with nobody sending anything to it)
permanently visible. SRT/SRTLA now behave like RTMP: **live-only**, same as
the OBS section below. Only a genuinely fixed, physically-plugged-in IP
camera gets the persistent "no signal" treatment. See
`roomProjection.ts`'s `ALWAYS_SHOW_PROTOCOLS` and the online-gating comment
in `receiverManager.ts#projectCamera`.

### 2. OBS custom stream (RTMP)

Pick **"OBS custom RTMP stream"**. The manager generates a stream
name/key pair. After saving, the setup screen gives you:
- **Server**: `rtmp://<lan-host>:1935/live` — paste into OBS → Settings →
  Stream → Service: Custom → Server.
- **Stream Key**: `<streamUser>?key=<streamKey>` — paste into OBS's Stream
  Key field exactly as shown, combined.

This requires RTMP ingest enabled in the manager's Server settings first
(there's nowhere to publish to otherwise — the form will reject the camera
without it). Multiple people can each get their own `type: rtmp` camera —
every one shares the same ingest container, distinguished only by stream
name/key, same as multiple SRTLA phones share the per-camera ingest port
pool today.

Rooms made up entirely of RTMP cameras default to **live-only**: the room
only exists while at least one of them is actually publishing. Stop
streaming in OBS and the room disappears from the site within a couple
seconds of the `on_publish_done` callback — no manual cleanup, no stale
"streamer offline" room sitting around.

## One roomScope = one room, always

Multiple cameras can share a `roomScope` (today's `game-room` currently has
one — `Cam0`, renamed "Game Room" — but could hold more). Mixing a fixed IP
camera and an RTMP/SRT/SRTLA camera in the same `roomScope` is allowed; the
room's inferred policy becomes **always-show** in that case (any
`ip-camera`-protocol camera in the group wins the inference — see
`roomProjection.ts#inferPolicy`).

## Overriding the inferred policy

The inference above is just a default. An admin can override it per room in
the core dashboard: **Tank → Rooms** (`/settings/tank/rooms`), independent of
what cameras happen to be in it. Room title/eyebrow/description/tags are also
curated there — uncurated rooms fall back to a title-cased version of the
`roomScope` string (`game-room` → "Game Room").

## What this doesn't cover

- **Audio** (does an IP camera have a usable mic, should a room's audio come
  from a different source) is a separate, deliberately out-of-scope concern
  here — see `tank-camera-audio-routing.md` and the per-camera Audio Sources
  admin page.
- **RTMP bitrate/RTT telemetry** isn't wired up yet — RTMP camera presence
  (online/offline) is real and instant via `srt_receiver`'s `on_publish`/
  `on_publish_done` callbacks, but bitrate always reads 0 for now. Would need
  nginx's `/stat` XML parsed separately; not blocking for room derivation,
  which only needs presence.
- **Publishing OBS from outside the LAN** — the RTMP server currently only
  allows publish from LAN/Docker-internal ranges (`nginx.conf`'s
  `allow publish`). Streaming in from off-network would need port
  forwarding/proxy exposure for 1935, not set up as part of this pass.
