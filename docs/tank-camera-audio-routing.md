# Tank camera/room audio routing — spec + implementation

Written 2026-08-15, alongside the migration `20260815051500_tank_camera_audio_routing.sql`.

## Problem

Different Tank cameras carry audio differently:
- SRTLA phone cams send footage **and** audio natively.
- Some fixed IP cameras have a built-in mic; many (like Cam0, a Dahua unit) don't.
- Rooms need to "cope" per-camera: a camera with no mic shouldn't just go silent —
  an operator should be able to bind an external audio source (an IP mic, a house
  ambient mic, a mixer line-out) to that camera instead.

Before this pass, the admin console (`admin/LiveCameraRegistry.tsx`) had an "Audio
Track Binding" dropdown that looked real but only called `setAssignedAudio` — local
React state, never written to the database, reset on every page reload. Also
discovered while wiring this up: the admin panel was fetching `/api/tank/admin/cameras`,
which didn't exist anywhere in the repo — that endpoint was a silent 404 the whole
time, so the admin camera registry never actually loaded real data at all.

## Model

Audio config lives **per camera**, not per room. A room's audio status is just
whatever its camera(s) resolve to — one source of truth, and rooms still "cope"
independently because each camera carries its own config.

`tank_camera_registry` gained two columns:
- `has_native_audio boolean default true` — admin-confirmed, NOT auto-detected
  (the receiver manager doesn't expose whether a stream carries an audio track).
  Defaults true (matches prior SRTLA-cam assumption); flip false for cameras
  confirmed to have no mic. Cam0 (`cam-1786768240090`) is seeded false pending
  operator confirmation the unit has no mic.
- `audio_mode text check (native|external|muted) default 'native'`

New table `tank_audio_sources` — the real catalog of external sources (replaces
the hardcoded array that used to live directly in the component), seeded with the
two "house" options that already existed as fake dropdown entries:
`house-ambient-mic`, `house-main-mic`. Admins can add more (e.g. a real IP mic)
once one exists — this is a real table with RLS (admin/service_role only), not a
static list.

## Write/read split (important)

`receiverManager.ts` polls the SRT manager on every request and upserts
telemetry into `tank_camera_registry` via `saveCameraLifecycleState`. That upsert
runs constantly (every ~2.5s from the client poll) — if it also wrote
`audio_source_id`/`audio_source_name` with default fallbacks on every call (which
the OLD code did), it would silently stomp an operator's external-mic assignment
back to "self" every few seconds. Fixed: `saveCameraLifecycleState` no longer
touches audio columns at all. `POST /api/tank/admin/cameras/audio` (validated
by `audioPolicy.ts#validateAudioAssignment`, persisted by
`cameraRegistryDb.ts#saveCameraAudioAssignment`) is the real admin-gated write
for `audio_source_id` / `audio_source_name` / `native_audio_muted` /
`cross_room_audio_confirmed`. Reading them back into the live
`DiscoveredCamera` snapshot is a separate function, `loadCameraAudioAssignment`.

## What actually got built

- Migration: columns + `tank_audio_sources` table + RLS + seed rows.
- `server/cameraRegistryDb.ts`: `loadCameraAudioConfig()` (read), lifecycle
  upsert no longer touches audio columns (write ownership fix above).
- `server/audioSources.ts` (new): `getAudioSourceCatalog()`.
- `server/actions.ts`: `setCameraAudioConfig()` is now a deliberate stub that
  redirects callers to the scoped admin audio API below — the real write
  lives there so room/shared-audio/native-replacement rules stay in one place.
- `contracts.ts`: `DiscoveredCamera` gained `audioMode` / `hasNativeAudio`
  (`audioSourceId`/`audioSourceName` already existed but were never populated —
  now they are).
- `server/receiverManager.ts`: `projectCamera` now loads and returns real audio
  config instead of leaving those fields unset.
- New API routes (previously missing): `GET /api/tank/admin/cameras` (full
  admin-scoped snapshot, admin-gated), `GET /api/tank/admin/audio-sources`
  (the real catalog, admin-gated).
- `admin/LiveCameraRegistry.tsx`: dropdown now shows Native / Muted / real
  catalog entries, calls the real server action, shows a save-in-flight spinner
  and inline error, and flags cameras with `audioMode=native` + `hasNativeAudio=false`
  with a visible "No confirmed mic" badge instead of silently pretending they
  have audio.

## Known gaps / next steps

- `has_native_audio` is never auto-detected — still requires an operator to look
  at the camera and confirm. A future pass could probe the RTSP SDP (via the SRT
  manager or ffprobe) for an audio stream and set this automatically.
- The IP-mic `kind` in `tank_audio_sources` exists in the schema but no real IP
  mic has been added to the catalog yet — do that once one is physically wired up,
  through the same admin panel (needs an "add source" UI, not built this pass —
  currently catalog rows are added via migration/SQL only).
- This work happened in parallel with another Tank development effort that has
  already shipped a *different*, more advanced camera contract to production
  (`tank.unenter.live`) — see the same day's session notes. The two haven't been
  reconciled; this audio work extends the dev-tree's existing `tank_camera_registry`
  contract, not whatever schema production is actually running on.
