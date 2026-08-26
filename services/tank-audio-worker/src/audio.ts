import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { config, type RoomSink } from "./config";

function run(command: string, args: string[], timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"], shell: false });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-4_000); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr}`));
    });
  });
}

export async function downloadAudio(url: string, requestId: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "kong", "storage"].includes(parsed.hostname))) {
    throw new Error("Audio source URL must use HTTPS or an approved local service host.");
  }
  const response = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Audio download returned HTTP ${response.status}.`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 10 * 1024 * 1024) throw new Error("Audio source exceeds 10 MB.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) throw new Error("Audio source size is invalid.");
  await mkdir(config.cacheDir, { recursive: true });
  const path = join(config.cacheDir, `${requestId}.source`);
  await writeFile(path, bytes, { mode: 0o600 });
  return path;
}

function clamp(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export async function normalizeAudio(inputPath: string, requestId: string, payload: Record<string, unknown>, sink: RoomSink) {
  const outputPath = join(config.cacheDir, `${requestId}.wav`);
  const pitch = clamp(payload.pitchFactor, 1, 0.5, 2);
  const speed = clamp(payload.speed, 1, 0.5, 2);
  const sourceVolume = clamp(payload.defaultVolume, 1, 0, 1);
  const filters = [
    `volume=${(sourceVolume * sink.volume).toFixed(4)}`,
    "loudnorm=I=-16:TP=-1.5:LRA=11",
  ];
  if (pitch !== 1) filters.push(`asetrate=48000*${pitch.toFixed(4)},aresample=48000,atempo=${(1 / pitch).toFixed(4)}`);
  if (speed !== 1) filters.push(`atempo=${speed.toFixed(4)}`);
  await run("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-t", "300", "-vn", "-af", filters.join(","), "-ar", "48000", "-ac", "2", outputPath], 90_000);
  return outputPath;
}

export async function playAudio(path: string, sink: RoomSink) {
  if (sink.driver === "wasapi") {
    if (!config.wasapiPlayer) throw new Error("TANK_AUDIO_WASAPI_PLAYER is required for WASAPI playback.");
    if (!sink.sink) throw new Error("A WASAPI endpoint ID is required for room playback.");
    return run(config.wasapiPlayer, ["--device-id", sink.sink, "--file", path], 310_000);
  }
  if (sink.driver === "pipewire") {
    const args = sink.sink ? ["--target", sink.sink, path] : [path];
    return run("pw-play", args, 310_000);
  }
  if (sink.driver === "pulse") {
    const args = sink.sink ? ["--device", sink.sink, path] : [path];
    return run("paplay", args, 310_000);
  }
  return run("ffplay", ["-nostdin", "-nodisp", "-autoexit", "-loglevel", "error", path], 310_000);
}

export async function cleanup(...paths: Array<string | null | undefined>) {
  await Promise.all(paths.filter(Boolean).map((path) => rm(path!, { force: true }).catch(() => undefined)));
}
