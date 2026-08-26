# Tank room audio pipeline

Tank room audio is an asynchronous, server-authorized path. Browser requests never receive Supabase service credentials, ElevenLabs keys, voice IDs, storage write credentials, or physical endpoint IDs.

```text
viewer/admin action
  -> Tank API policy + rate limit
  -> atomic Postgres entitlement/token redemption
  -> moderation (when required)
  -> per-room queue claim
  -> TTS generation or approved SFX download
  -> FFmpeg normalization/effect processing
  -> exact room sink playback
  -> completion/failure/refund audit
  -> room/global house-event chat broadcast
```

## Canonical records

- `tank_sfx_library`: approved clips and public presentation metadata.
- `tank_audio_requests`: canonical queue and execution audit.
- `tank_audio_redemptions`: immutable debit/refund history.
- `tank_tts_cache`: generated TTS cache metadata; audio objects remain private.
- `tank_room_audio_effects`: bounded room modifiers activated by approved hazards.
- `tank_inventory_items`: optional audio effect type/payload for owned items.

Queue state changes and entitlement/token changes occur inside database functions so a double-click cannot redeem twice. Claims use `FOR UPDATE SKIP LOCKED`, and the database permits at most one playing request per room. Failed final attempts refund the recorded token or inventory debit once.

## Output modes

- `embedded`: audio remains part of the room's camera/program stream.
- `client-broadcast`: approved audio is broadcast to watching clients.
- `host-bluetooth`: the environment-node worker plays through a privately mapped OS endpoint.

A muted room is not claimable. A missing Bluetooth device fails closed; playback never falls through to the default Windows output.

## Current commissioning boundary

The schema, APIs, UI, worker, and Windows endpoint helper can ship while all audio feature flags remain disabled. Enabling real-world playback requires an operator to map each room to a physically verified endpoint and configure at least one server-side TTS provider. SFX availability also requires approved audio objects in the `tank-soundboard` bucket and matching library rows.
