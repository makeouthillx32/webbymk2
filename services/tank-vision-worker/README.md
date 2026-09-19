# tank-vision-worker

The house's eyes, running whether or not anyone is looking.

Detection used to live in `PeopleDetectionEngine`, inside a React effect, against
hidden `<video>` elements it appended to `document.body`. That worked, but it
meant the director could only see while a staff member happened to have the
director-configuration page open. Close the tab and the house went blind:
nothing accumulated, tracking lost the thread, and there was no event history to
build memory from. This process is the fix — the same decoder, the same identity
catalog, no browser.

## How it fits

```
MediaMTX (cameras/<id>-hls)
      │  ffmpeg: decode + letterbox at OUR dimensions
      ▼
FramePuller ──► rgbaToTensor ──► YOLOv8n (onnxruntime-web, wasm)
                                      │
                                      ▼
                               parseYoloOutput            ← shared with the browser
                                      │
                               trackMotion                ← shared with the browser
                                      │
                         appearance matcher + resolveDetection  ← tier-2 identity
                                      │
                                      ▼
              POST /api/tank/director/telemetry  (x-tank-ingest-secret)
                                      │
                    the same in-memory store the browser posted to,
                    so atlas / director / matrix need no changes at all
```

The decoder (`src/zones/tank/vision/decode.ts`), the motion tracker
(`motion.ts`) and the identity catalog (`src/zones/tank/server/detectionCatalog.ts`)
are imported **from the app's own tree by relative path**, not copied. Two
observers that disagree about what was in frame would be worse than one, so
there is deliberately only one copy of that logic. The Dockerfile preserves the
repo-relative layout so those imports resolve identically inside the image.

## Design decisions worth knowing

**`onnxruntime-web`, not `onnxruntime-node`.** Verified under Bun 1.3.14 on
2026-09-09: `typeof window` and `typeof document` are both `undefined`, the
session builds from the same 12.9 MB checkpoint in ~283 ms, and `output0` comes
back `[1,84,8400]`. The wasm backend needs no DOM, so no native N-API addon is
required — which matters because this image runs Bun and a prebuilt `.node`
binary would be a standing compatibility risk for no benefit.

**We compute the letterbox, ffmpeg applies it.** `computeLetterbox` decides the
scale and pad and the filter graph is built from its numbers, rather than letting
ffmpeg's `force_original_aspect_ratio=decrease` + `pad` pick. Those usually
agree, but any disagreement would shift every box by a pixel or two with nothing
ever reporting it. `src/frameSource.test.ts` asserts on the actual pixels to
prove the pad band lands exactly where the decoder expects.

**No `-fflags nobuffer -flags low_delay`.** They look right for a live source.
Measured 2026-09-09, they make ffmpeg exit 0 having written *nothing* to stdout —
a silent zero-frame failure indistinguishable from a dead camera. Detection does
not care about sub-second latency (the browser engine ticked every 2 s), so they
could only ever have bought the bug.

**Inference round-robins; posting does not.** A wasm session is not reentrant and
a pass costs ~500 ms, so one camera is inferred per pass. But
`TELEMETRY_TTL_MS` is 4000 ms and six cameras at ~600 ms/pass is ~3.6 s per
cycle — close enough that any hiccup would make cameras flicker out of the
director's view. So every pass re-posts the *whole* current set. Re-posting is
nearly free; re-inferring is not. Each reading carries its own `observedAt`, so
genuine staleness stays visible rather than being hidden by the refresh.

**Identity refuses to guess.** A 40-value appearance probe must clear both a
similarity floor and a runner-up margin before `resolveDetection` receives a
household slug. People are compared only with people, cats only with cats, and
dogs only with dogs. Weak evidence stays unnamed. A confident wrong name teaches
the operator to distrust every label on screen.

## Deployment and live acceptance

This workspace is UNAXIS-managed. Do not run Docker or Docker Compose directly.
Delegate the Tank application and `tank-vision-worker` build/restart to the
UNAXIS operator. Once both services report healthy, run the acceptance gate from
an environment carrying the worker's Supabase and Tank ingest variables:

```bash
bun run verify:identity
```

The gate exits non-zero unless all deterministic, live-compatible seed rows
are active across Tyler, Malia, Joe, Molly, Olly, James, and Kitty **and** the
running worker reports that it loaded all seven targets with zero rejected
vectors. Database readiness alone is not runtime proof.

It is a pure consumer: if it is down, Tank and the cameras are unaffected and the
director falls back to whatever telemetry a browser posts.

## Self-test, no stack required

Proves decode → letterbox → tensor → model → boxes end to end, and checks the
channel order by running every input as RGB and as BGR:

```bash
cd services/tank-vision-worker
SUPABASE_URL=x SUPABASE_SERVICE_ROLE_KEY=x TANK_ARCHIVE_INGEST_SECRET=x \
  TANK_VISION_MODEL_PATH=../../public/models/yolov8n.onnx \
  bun src/selftest.ts ../../public/hero-image-01.jpg ../../public/images/blog/blog-01.jpg
```

Measured 2026-09-09: `hero-image-01.jpg` → 5 people in RGB vs 4 in BGR;
`blog-01.jpg` → 0.926 vs 0.850. That margin is the check. If BGR ever matches or
beats RGB, `rgbaToTensor` has been broken.

## Configuration

Required:

| var | meaning |
| --- | --- |
| `SUPABASE_URL` | internal Supabase (Kong) URL |
| `SUPABASE_SERVICE_ROLE_KEY` | reads `tank_camera_registry` for the camera→room map |
| `TANK_ARCHIVE_INGEST_SECRET` | shared secret for the telemetry ingest route |

Optional:

| var | default | meaning |
| --- | --- | --- |
| `TANK_BASE_URL` | `http://unt_tank:3000` | where readings are POSTed |
| `MEDIAMTX_API_URL` | `http://unt_mediamtx:9997` | path readiness |
| `MEDIAMTX_HLS_URL` | `http://unt_mediamtx:8888` | HLS pull base |
| `MEDIAMTX_API_TOKEN` | — | if the API is token-gated |
| `TANK_VISION_CAPTURE_FPS` | `1` | frames pulled per camera per second |
| `TANK_VISION_INFERENCE_INTERVAL_MS` | `600` | gap between inference passes |
| `TANK_VISION_WASM_THREADS` | `1` | ONNX wasm threads |
| `TANK_VISION_ROOMS` | all | comma-separated room scopes to watch |
| `TANK_VISION_CAMERA_DENY` | — | comma-separated camera ids to skip |
| `TANK_VISION_FRAME_STALE_MS` | `15000` | older frames are treated as no frame |
| `TANK_VISION_ROSTER_REFRESH_MS` | `30000` | how often the roster is re-read |
| `TANK_VISION_MODEL_PATH` | `./models/yolov8n.onnx` | the checkpoint |
| `TANK_VISION_FFMPEG_PATH` | `ffmpeg` | ffprobe is derived from this |
| `TANK_VISION_LOG_DETECTIONS` | `1` | set `0` to quieten per-detection lines |

## Known limits

- **Motion tracking is positional.** Nearest-centre matching within
  `MATCH_RADIUS` (0.25 normalized). It cannot survive two subjects crossing, and
  anything moving more than a quarter of the frame per tick reports velocity 0 —
  the fastest motion is what it sees least well. Raising `TANK_VISION_CAPTURE_FPS`
  narrows that window.
- **Identity is appearance-based, not room-based.** The worker materializes the
  seven user-labeled household seed profiles and confirmed archive crops into
  `tank_appearance_enrolment`, then reloads active 40-value signatures on every
  roster refresh. Person, cat, and dog remain strict separate species pools;
  weak matches remain generic rather than guessed.
- **Reference-photo-only human profiles are provisional.** Tyler, Malia, and Joe
  have a live-compatible initial signature, but clothing-dominated matching will
  improve as confirmed camera captures are added. Staff Room reports exactly
  which profiles the running worker has loaded.
- **One global score floor.** `MIN_SCORE = 0.5` for person, cat and dog alike.
- **Audio is not observed here.** This worker watches video only and reports
  `audioPeak: 0` / `isSpeaking: false`; audio belongs to `tank-audio-worker`.
