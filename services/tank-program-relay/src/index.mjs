// services/tank-program-relay/src/index.mjs
//
// Supervises three things that all have to be alive at once for the relay to
// mean anything: a Chromium tab showing the Director programme, and an
// ffmpeg process capturing that tab's picture (X11) and sound (PulseAudio
// monitor) into one RTMP publish. Either one can die or silently stop
// producing frames without the other noticing — Chromium can render a black
// "aw, snap" page and keep the process alive, ffmpeg can keep running with a
// stalled input and never exit — so this also polls both for actual signs of
// life and restarts the whole pipeline when either goes quiet. There is no
// partial-restart path: half-torn-down state is exactly what produced the
// original OBS `audio` flag bugs this relay exists to avoid (see
// DirectorObsScene.tsx), so every restart tears down and rebuilds both.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const SOURCE_URL = process.env.RELAY_SOURCE_URL
  || 'http://unt_tank:3000/obs/director?volume=100&theme=cctv';
const RTMP_URL = process.env.RELAY_RTMP_URL;
const WIDTH = Number(process.env.RELAY_WIDTH || 1920);
const HEIGHT = Number(process.env.RELAY_HEIGHT || 1080);
const FPS = Number(process.env.RELAY_FPS || 30);
const VIDEO_BITRATE = process.env.RELAY_VIDEO_BITRATE || '4500k';
const DISPLAY = process.env.DISPLAY || ':99';
const STALL_TIMEOUT_MS = Number(process.env.RELAY_STALL_TIMEOUT_MS || 15000);
const HEALTH_INTERVAL_MS = Number(process.env.RELAY_HEALTH_INTERVAL_MS || 5000);
const RESTART_BACKOFF_MS = Number(process.env.RELAY_RESTART_BACKOFF_MS || 3000);
const VERBOSE_FFMPEG = process.env.RELAY_FFMPEG_VERBOSE === '1';

if (!RTMP_URL) {
  console.error('[relay] RELAY_RTMP_URL is required (rtmp://.../obs/director?user=director&pass=<key>)');
  process.exit(1);
}

let browser = null;
let context = null;
let page = null;
let ffmpeg = null;
let lastFfmpegProgressAt = 0;
let restarting = false;
let stopping = false;
let healthTimer = null;
let pageLoadedAt = 0;
// The page has to fetch its playback manifest and start buffering before a
// <video> element actually plays — checking immediately after load would
// restart a perfectly healthy pipeline before it ever got a chance.
const HEALTH_GRACE_MS = Number(process.env.RELAY_HEALTH_GRACE_MS || 30000);

function log(...args) {
  console.log('[relay]', ...args);
}

async function openPage() {
  log('launching chromium ->', SOURCE_URL);
  browser = await chromium.launch({
    // Headless Chromium draws nothing an X11 grab can see — this has to be a
    // real window on the real (virtual) display for ffmpeg's x11grab input.
    headless: false,
    args: [
      '--window-position=0,0',
      `--window-size=${WIDTH},${HEIGHT}`,
      '--autoplay-policy=no-user-gesture-required',
      '--disable-infobars',
      '--noerrdialogs',
      '--no-first-run',
      '--kiosk',
      '--disable-session-crashed-bubble',
      '--check-for-update-interval=31536000',
      // Chromium's setuid sandbox needs kernel privileges this container
      // doesn't grant. Safe here specifically because the only page ever
      // loaded is our own first-party Director URL, never arbitrary content.
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
  context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  page = await context.newPage();
  page.on('crash', () => scheduleRestart('page-crash'));
  if (process.env.RELAY_DEBUG === '1') {
    page.on('console', (msg) => log('page console:', msg.type(), msg.text()));
    page.on('pageerror', (err) => log('page error:', err.message));
  }
  await page.goto(SOURCE_URL, { waitUntil: 'load', timeout: 30000 });
  log('page loaded');
  pageLoadedAt = Date.now();
}

function startFfmpeg() {
  const args = [
    '-y',
    // Raw 1080p30 BGR out of x11grab is ~2 Gbps into the encoder thread —
    // the default 8-frame queue between capture and encode fills instantly
    // ("Thread message queue blocking") and x264 starts dropping/duping to
    // hold realtime. A deeper queue absorbs that burst instead of shedding
    // frames every cycle.
    '-thread_queue_size', '512',
    '-f', 'x11grab',
    '-video_size', `${WIDTH}x${HEIGHT}`,
    '-framerate', String(FPS),
    '-i', `${DISPLAY}.0`,
    '-thread_queue_size', '512',
    '-f', 'pulse',
    '-i', 'relay_sink.monitor',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    '-g', String(FPS * 2),
    '-b:v', VIDEO_BITRATE,
    '-c:a', 'aac',
    '-b:a', '160k',
    '-ar', '44100',
    '-f', 'flv',
    RTMP_URL,
  ];
  log('starting ffmpeg');
  lastFfmpegProgressAt = Date.now();
  ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  ffmpeg.stdout.on('data', (chunk) => {
    if (VERBOSE_FFMPEG) process.stdout.write(chunk);
  });
  ffmpeg.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (/frame=/.test(text)) lastFfmpegProgressAt = Date.now();
    if (VERBOSE_FFMPEG) process.stderr.write(text);
  });
  ffmpeg.on('exit', (code, signal) => {
    ffmpeg = null;
    if (stopping) return;
    log(`ffmpeg exited code=${code} signal=${signal}`);
    scheduleRestart('ffmpeg-exit');
  });
}

async function teardown() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  try { ffmpeg?.kill('SIGKILL'); } catch { /* already gone */ }
  ffmpeg = null;
  try { await page?.close(); } catch { /* already gone */ }
  try { await context?.close(); } catch { /* already gone */ }
  try { await browser?.close(); } catch { /* already gone */ }
  page = null;
  context = null;
  browser = null;
}

function scheduleRestart(reason) {
  if (restarting || stopping) return;
  restarting = true;
  log('restarting pipeline — reason:', reason);
  setTimeout(async () => {
    try {
      await teardown();
      await openPage();
      startFfmpeg();
      startHealthLoop();
    } catch (err) {
      console.error('[relay] restart failed, will retry:', err);
      restarting = false;
      scheduleRestart('restart-failed');
      return;
    }
    restarting = false;
  }, RESTART_BACKOFF_MS);
}

function startHealthLoop() {
  healthTimer = setInterval(async () => {
    if (stopping || restarting) return;
    if (Date.now() - pageLoadedAt < HEALTH_GRACE_MS) return;

    if (Date.now() - lastFfmpegProgressAt > STALL_TIMEOUT_MS) {
      scheduleRestart('ffmpeg-stalled');
      return;
    }

    try {
      // The Director programme is a dual-buffer crossfade (see
      // DirectorObsScene.tsx) — two <video> elements exist at all times, and
      // only one is ever the active, visible, actually-playing one. Checking
      // just document.querySelector('video') (the first in DOM order) means
      // roughly half the time you're reading the idle standby buffer, which
      // is legitimately paused with readyState 0 — that is not a stall, it's
      // normal, and restarting the whole pipeline over it is the bug this
      // comment is here to stop someone from reintroducing.
      const states = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('video')).map((video) => ({
          paused: video.paused,
          readyState: video.readyState,
          error: video.error ? String(video.error.message || video.error.code) : null,
          currentTime: video.currentTime,
        }));
      });
      const playing = states.some((v) => !v.paused && v.readyState >= 2);
      if (!playing) {
        log('no video buffer playing:', JSON.stringify(states));
        scheduleRestart('no-video-buffer-playing');
      }
    } catch (err) {
      scheduleRestart('page-health-check-failed');
    }
  }, HEALTH_INTERVAL_MS);
}

async function main() {
  await openPage();
  startFfmpeg();
  startHealthLoop();
  log('relay running ->', RTMP_URL.replace(/pass=[^&]+/, 'pass=***'));
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    stopping = true;
    await teardown();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[relay] fatal startup error', err);
  process.exit(1);
});
