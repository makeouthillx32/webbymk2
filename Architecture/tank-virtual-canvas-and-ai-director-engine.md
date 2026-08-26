# Tank Virtual Canvas & AI Vision Director Engine Specification

**Document ID**: `tank-virtual-canvas-and-ai-director-engine`
**Status**: Master Architecture & Production Engineering Specification
**Target Systems**: Tank Ingest, TouchDesigner / Python Vision, Server Director Engine, Admin Control Plane

---

## 1. The Virtual Canvas Model

Instead of a traditional video switcher, the Tank Director operates as a **Virtual Viewport traversing a deterministic 49.8-Megapixel Video Atlas**.

```
                           THE VIRTUAL 49.8 MP 3×2 ATLAS (11,520 × 4,320)
(0,0)                           (3840,0)                        (7680,0)
┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ CAMERA 1 (Game Room)          │ CAMERA 2 (Living Room)        │ CAMERA 3 (Kitchen)            │
│ 3840 × 2160                   │ 3840 × 2160                   │ 3840 × 2160                   │
│ Bounds: [0, 0, 3840, 2160]    │ Bounds: [3840, 0, 7680, 2160] │ Bounds: [7680, 0, 11520, 2160]│
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ CAMERA 4 (Garage)             │ CAMERA 5 (Patio)              │ CAMERA 6 (Studio / IRL)       │
│ 3840 × 2160                   │ 3840 × 2160                   │ 3840 × 2160                   │
│ Bounds: [0, 2160, 3840, 4320] │ Bounds: [3840, 2160, 7680, ...]│ Bounds: [7680, 2160, 11520,..]│
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
(0,2160)                        (3840,2160)                     (7680,2160)
```

---

## 2. Dual Atlas Architecture (Proxy vs Broadcast)

To prevent GPU compute exhaustion while maintaining full 4K broadcast fidelity:

1. **Broadcast Canvas**:
   - Logical 11,520 × 4,320 coordinate space.
   - Native 4K streams are dynamically cropped or switched using native TOP transforms.
2. **Analysis Proxy Atlas**:
   - Scaled down by 6× into a single **1920 × 720** inference mosaic (each camera tile = **640 × 360**).
   - PyTorch / YOLOv8 inference runs at **5–15 FPS** on the proxy atlas.
   - Detections are normalized into `[0.0, 1.0]` floats, translating seamlessly across both coordinate spaces.

---

## 3. Pose Detection & "Foot Mode" Mechanics

Instead of generic object detection, pose estimation extracts skeletal keypoints:
- `left_ankle`, `right_ankle`, `left_knee`, `right_knee`, `hips`, `shoulders`, `face_nose`.

```ts
export type CameraPoseScore = {
  cameraId: string;
  cameraName: string;
  peopleCount: number;
  visibleFeetCount: number;
  feetConfidence: number;
  audioPeak: number;
  isSpeaking: boolean;
  totalScore: number;
};
```

### Heuristic Scoring Formula:
- **Feet Mode**: `score = (visibleFeetCount * 12) + (feetConfidence * 10) + (audioPeak * 0.2)`
- **Speaker Mode**: `score = (audioPeak * 0.6) + (isSpeaking ? 30 : 0) + (peopleCount * 5)`
- **Crowd / Party Mode**: `score = (peopleCount * 15) + (motionScore * 8) + (audioPeak * 0.4)`
- **Chaos Mode**: `score = (peopleCount * 10) + (audioPeak * 0.5) + (motionScore * 10) + (itemTriggerCount * 20)`

---

## 4. Director Cinematography: Subject & Framing Modes

| Property | Options | Description |
| :--- | :--- | :--- |
| **Subject Mode** | `auto`, `person`, `speaker`, `feet`, `face`, `motion`, `crowd`, `chaos`, `manual` | What targets the director prioritizes. |
| **Framing Mode** | `camera`, `group`, `follow`, `close`, `wide` | How the shot is composed (Full tile vs Bounding crop vs Virtual PTZ). |
| **Motion Mode** | `SNAP` vs `TRACK` | **SNAP** for instant tile switching; **TRACK** for smoothed easing (`x += (target - x) * 0.08`). |

---

## 5. Hysteresis, Cooldown, and Cut Guards

To prevent rapid, jarring flipping ("camera ping-pong"):
- **Hysteresis Threshold**: A challenger camera must beat the active camera score by at least **+15 points for 1.5 consecutive seconds** before a cut triggers.
- **Minimum Shot Duration**: 4.0 seconds (hard lock).
- **Preferred Shot Duration**: 8.0 to 20.0 seconds.
- **Maximum Idle Timeout**: 30.0 seconds (forces a cut to active rooms if current camera goes cold).
- **Tile Boundary Clamp**: Virtual PTZ tracking is constrained to stay inside the host camera's `[xMin, yMin, xMax, yMax]` bounding box to avoid splitting adjacent feeds.

---

## 6. Realtime Communication Protocol

- **Inference Ingest**: Python/TouchDesigner worker emits JSON metadata over WebSocket / Supabase Realtime topic: `director:vision_telemetry`.
- **State Broadcast**: Server Director Engine calculates `activeCamera`, `directorScoreMatrix`, and `framingCrop` and publishes to `director:state`.
