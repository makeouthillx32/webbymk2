# Tank room audio worker

This server-only worker claims approved `tank_audio_requests` and routes each room to one configured OS audio sink. It never runs in a browser and must receive the Supabase service key, ElevenLabs key, voice IDs, and Bluetooth/PipeWire/PulseAudio sink IDs through its environment.

Safety properties:

- Postgres permits only one `playing` row per room.
- Multiple rooms can play concurrently, but a single room is always sequential.
- The worker refuses to start with an empty room/sink map.
- Child processes use argument arrays with `shell: false`; queue payloads cannot inject commands.
- Audio downloads are capped at 10 MB and processing/playback is capped at five minutes.
- FFmpeg normalizes to stereo 48 kHz WAV and bounds volume, speed, and pitch.
- TTS provider order is configurable. Fish Audio REST, ElevenLabs REST, and an OpenAI-compatible local endpoint such as `kokoro-open-tts` can fail over without changing the Tank queue contract.

Copy `.env.example` outside source control, populate real sink IDs, pair the Bluetooth devices at the host OS, and validate each sink with a local test tone before enabling `host-bluetooth` on a room. Do not put this worker in the public Tank zone container: it belongs on the environment node that owns the physical audio devices.

## Windows room speakers

The `windows-player` helper uses Windows WASAPI shared mode through NAudio. It targets an exact endpoint ID, so Windows changing its default speaker cannot send a Tank request to the wrong room.

```powershell
dotnet publish .\windows-player\TankAudioPlayer.csproj -c Release -r win-x64 --self-contained false
.\windows-player\bin\Release\net9.0-windows10.0.19041\win-x64\publish\TankAudioPlayer.exe --list
```

Use the resulting executable path as `TANK_AUDIO_WASAPI_PLAYER`, and map stable `tank_rooms.room_key` values to the listed endpoint IDs with the `wasapi` driver. Endpoint IDs and service keys stay in the worker environment, never in `tank_rooms` or browser JSON.

Do not enable a room until its speaker is paired, active, and verified locally. Bluetooth endpoint IDs can change after removing and re-pairing a device; an absent ID makes the request fail and retry safely instead of falling back to the system default.

## Activation order

1. Pair and name each physical speaker on the environment node.
2. Build the WASAPI helper (Windows) or confirm the PipeWire/Pulse sink (Linux).
3. Populate the private room/sink map and TTS credentials.
4. Start the worker and confirm it refuses an empty map, then observe a clean claim loop.
5. In the Tank house console, change only verified rooms to `host-bluetooth`.
6. Enable `sfx_enabled`, `tts_enabled`, and finally `hazard_audio_enabled` one at a time.

The database feature flags intentionally default to off. This makes schema/application deployment safe before physical routing is commissioned.

## Fish Audio

Fish runs as a server-only provider inside this worker; the public Tank zone never receives its API key or voice reference IDs. Configure `FISH_AUDIO_API_KEY`, map approved aliases with `FISH_AUDIO_VOICES`, and choose the ordered failover ladder with `TANK_TTS_PROVIDER_ORDER` (default `fish-audio,elevenlabs,local`). `FISH_AUDIO_MODEL` defaults to the current developer model `s2.1-pro-free`; treat that model name as configuration because Fish can change hosted availability.

Example variable shapes (IDs deliberately placeholders):

```text
TANK_TTS_PROVIDER_ORDER=fish-audio,elevenlabs,local
FISH_AUDIO_MODEL=s2.1-pro-free
FISH_AUDIO_LATENCY=balanced
FISH_AUDIO_VOICES={"default":"approved-reference-id","announcer":"approved-reference-id-2"}
```

Only consented, producer-approved voice references belong in that map. Do not accept arbitrary reference audio or Fish voice IDs from viewer requests.
