import {
  MEMORY,
  applyLook,
  cropToTensor,
  exclusiveNames,
  loadPack,
  packChangedOnDisk,
  recall,
  scoreEmbedding,
  type GalleryPack,
  type GalleryVerdict,
  type Remembered,
} from "./galleryNaming";

import { fileURLToPath } from "node:url";

type Box = { nx: number; ny: number; nw: number; nh: number; label: string };
type Reply = { id: number; embedding?: Float32Array; error?: string };
type Rect = { x: number; y: number; w: number; h: number };

/**
 * At most this many crops waiting for the naming thread, house-wide. When it is
 * full the bodies that have waited longest keep their places.
 */
const MAX_QUEUE = 6;
const RELOAD_CHECK_MS = 30_000;

/**
 * Names people from the graded gallery without ever waiting for the model.
 *
 * nameFrame() answers from memory immediately and queues fresh looks for the
 * naming process (osnetProcess.ts); answers land in memory and show up on the
 * next pass over that camera. A person seen for the first time is unnamed for one pass, which is
 * the price of never slowing detection.
 */
export class GalleryNamer {
  private pack: GalleryPack | null = null;
  private lastReloadCheck = 0;
  private readonly memory = new Map<string, Remembered[]>();
  private child: ReturnType<typeof Bun.spawn> | null = null;
  private stopping = false;
  private readonly waiting = new Map<number, (embedding: Float32Array | null) => void>();
  private nextId = 1;
  private busy = false;
  private stats = { frames: 0, queued: 0, looks: 0, named: 0, hidden: 0, tooSmall: 0, failed: 0 };
  private lastStatsLog = Date.now();
  private queue: Array<{ entry: Remembered; tensor: Float32Array; pack: GalleryPack }> = [];

  constructor(private readonly dir: string) {
    this.spawnChild();
    this.reloadIfChanged(true);
  }

  /** True when a graded gallery is loaded and people are named from it. */
  get active(): boolean {
    return this.pack !== null;
  }

  get summary(): string {
    if (!this.pack) return "no graded gallery";
    return `${this.pack.names.length} graded crops of ${new Set(this.pack.names).size} people, ${this.pack.negativeRows} not-a-person`;
  }

  private reloadIfChanged(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastReloadCheck < RELOAD_CHECK_MS) return;
    this.lastReloadCheck = now;
    try {
      if (!packChangedOnDisk(this.dir, this.pack)) return;
      this.pack = loadPack(this.dir);
      if (this.pack) console.log(`[tank-vision] graded gallery loaded: ${this.summary}`);
    } catch (error) {
      // Mid-rebuild or unreadable: keep what we had.
      console.warn(`[tank-vision] graded gallery not reloaded: ${error instanceof Error ? error.message : error}`);
    }
  }

  private spawnChild(): void {
    const script = fileURLToPath(new URL("./osnetProcess.ts", import.meta.url));
    this.child = Bun.spawn([process.execPath, script], {
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"],
      serialization: "advanced",
      ipc: (reply: Reply) => this.onReply(reply),
      onExit: (_proc, code) => {
        // Whatever was in flight is lost: release it, and bring the process back.
        for (const [, done] of this.waiting) done(null);
        this.waiting.clear();
        this.child = null;
        if (this.stopping) return;
        console.warn(`[tank-vision] naming process exited (${code}); restarting in 5 s`);
        setTimeout(() => this.spawnChild(), 5_000);
      },
    });
  }

  private onReply(reply: Reply): void {
    const done = this.waiting.get(reply.id);
    this.waiting.delete(reply.id);
    if (reply.error) {
      this.stats.failed += 1;
      console.warn(`[tank-vision] naming process: ${reply.error}`);
    }
    done?.(reply.embedding ?? null);
  }

  stop(): void {
    this.stopping = true;
    this.child?.kill();
  }

  private embed(tensor: Float32Array): Promise<Float32Array | null> {
    const child = this.child;
    if (!child) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      // A look that never comes back must not wedge the queue for good.
      const timer = setTimeout(() => {
        if (this.waiting.delete(id)) resolve(null);
      }, 10_000);
      this.waiting.set(id, (embedding) => {
        clearTimeout(timer);
        resolve(embedding);
      });
      child.send({ id, tensor });
    });
  }

  /** Feed the thread one crop at a time, the longest-waiting body first, house-wide. */
  private pump(): void {
    if (this.busy || this.queue.length === 0) return;
    this.queue.sort((a, b) => a.entry.checkedAt - b.entry.checkedAt);
    const job = this.queue.shift()!;
    this.busy = true;
    void this.embed(job.tensor).then((embedding) => {
      this.busy = false;
      job.entry.pending = false;
      job.entry.checkedAt = Date.now();
      if (embedding && this.pack === job.pack) {
        job.entry.verdict = applyLook(job.entry, scoreEmbedding(job.pack, embedding));
        this.stats.looks += 1;
        if (job.entry.verdict.notAPerson) this.stats.hidden += 1;
        else if (job.entry.verdict.name) this.stats.named += 1;
      }
      this.pump();
    });
  }

  /**
   * Verdicts for the person boxes of one frame, keyed by their index in `boxes`.
   * `rectOf` maps a box to pixel coordinates in `rgba` (the worker's frame).
   */
  nameFrame(
    cameraId: string,
    boxes: readonly Box[],
    rgba: Uint8Array | Uint8ClampedArray,
    frameW: number,
    frameH: number,
    rectOf: (box: Box) => Rect,
  ): Map<number, GalleryVerdict> {
    this.reloadIfChanged();
    const pack = this.pack;
    if (!pack) return new Map();
    const now = Date.now();
    this.stats.frames += 1;
    if (now - this.lastStatsLog >= 60_000) {
      // Once a minute: proof the naming lane is alive, and how well it is doing.
      console.log(`[tank-vision] naming: ${JSON.stringify(this.stats)} queue=${this.queue.length} busy=${this.busy}`);
      this.lastStatsLog = now;
    }
    const memory = (this.memory.get(cameraId) ?? []).filter(
      (entry) => entry.pending || now - entry.checkedAt <= MEMORY.forgetMs,
    );

    const claims: Array<{ index: number; verdict: GalleryVerdict | null }> = [];
    const due: Array<{ entry: Remembered; box: Box }> = [];
    const used = new Set<Remembered>();
    boxes.forEach((box, index) => {
      if (box.label !== "person") return;
      let entry = recall(memory.filter((m) => !used.has(m)), box, now);
      if (!entry) {
        entry = { box, verdict: null, checkedAt: 0, pending: false };
        memory.push(entry);
      }
      used.add(entry);
      entry.box = box;
      claims.push({ index, verdict: entry.verdict });
      if (!entry.pending && now - entry.checkedAt >= MEMORY.recheckMs) due.push({ entry, box });
    });

    // Queue this frame's due bodies (the crop is cut now, from this frame).
    // House-wide, the longest-waiting body goes first: a body never looked at
    // ahead of one looked at a moment ago, whichever camera it is on.
    for (const { entry, box } of due) {
      const tensor = cropToTensor(rgba, frameW, frameH, rectOf(box));
      if (!tensor) {
        this.stats.tooSmall += 1;
        continue;
      }
      entry.pending = true;
      this.queue.push({ entry, tensor, pack });
      this.stats.queued += 1;
    }
    if (this.queue.length > MAX_QUEUE) {
      this.queue.sort((a, b) => a.entry.checkedAt - b.entry.checkedAt);
      for (const dropped of this.queue.splice(MAX_QUEUE)) dropped.entry.pending = false;
    }
    this.pump();

    this.memory.set(cameraId, memory);
    return exclusiveNames(claims);
  }
}
