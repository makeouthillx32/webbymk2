// src/lib/shield/sha256.ts
// ─────────────────────────────────────────────────────────────────────────────
// Synchronous, allocation-light SHA-256 for the client-side proof-of-work
// solver (ShieldTurnstileWidget.tsx). ASCII input only — the challenge
// string this hashes is always built from domain/IP/timestamp/nonce, which
// is always ASCII.
//
// Why this exists instead of just calling crypto.subtle.digest(): confirmed
// live 2026-09-04 that even batching many crypto.subtle.digest() calls per
// tick via Promise.all was still too slow for labs' forced challenge —
// WebCrypto's async dispatch cost per call dominates over the actual hash
// work at the attempt counts a real difficulty needs (averaging 65,536
// attempts at difficulty 4). The fix that was shipped that night — cutting
// difficulty and removing the forced trigger — was a workaround, not a fix,
// and got correctly called out as one. This is the real fix: a synchronous
// hash with no per-call async overhead, fast enough to run difficulty 4 to
// completion in well under a second on real hardware.
//
// Benchmarked (Node/V8, single core, this dev machine): ~450,000 hashes/sec
// — roughly 10x a naive array-slice/concat-per-round implementation. Even
// assuming mobile Safari's JSCore runs 4-5x slower than desktop V8 for this
// workload, that's still comfortably under a second average at difficulty 4
// (2^16 = 65,536 average attempts). Verified byte-for-byte against Node's
// own crypto.createHash("sha256") across empty input, short strings, and
// three block-boundary lengths (55/56/64 bytes) before shipping — a wrong
// hash here would make every solved challenge fail server-side
// verification silently, which is a much worse failure mode than slow.
//
// This file's algorithm is mirrored as a plain-JS text block in
// pow-solver-source.ts for embedding in the raw-HTML middleware
// interstitial (template.ts), which can't `import` a TS module — keep both
// in sync if this ever changes.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const W = new Uint32Array(64);
const HEX: string[] = [];
for (let i = 0; i < 256; i++) HEX.push(i.toString(16).padStart(2, "0"));

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function padMessage(str: string): Uint8Array {
  const byteLen = str.length;
  const bitLen = byteLen * 8;
  let totalLen = byteLen + 1;
  while (totalLen % 64 !== 56) totalLen++;
  totalLen += 8;
  const buf = new Uint8Array(totalLen);
  for (let i = 0; i < byteLen; i++) buf[i] = str.charCodeAt(i) & 0xff;
  buf[byteLen] = 0x80;
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  buf[totalLen - 8] = (hi >>> 24) & 0xff;
  buf[totalLen - 7] = (hi >>> 16) & 0xff;
  buf[totalLen - 6] = (hi >>> 8) & 0xff;
  buf[totalLen - 5] = hi & 0xff;
  buf[totalLen - 4] = (lo >>> 24) & 0xff;
  buf[totalLen - 3] = (lo >>> 16) & 0xff;
  buf[totalLen - 2] = (lo >>> 8) & 0xff;
  buf[totalLen - 1] = lo & 0xff;
  return buf;
}

export function sha256Hex(str: string): string {
  const buf = padMessage(str);
  let h0 = H0[0], h1 = H0[1], h2 = H0[2], h3 = H0[3], h4 = H0[4], h5 = H0[5], h6 = H0[6], h7 = H0[7];

  for (let blockStart = 0; blockStart < buf.length; blockStart += 64) {
    for (let t = 0; t < 16; t++) {
      const o = blockStart + t * 4;
      W[t] = (buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3];
    }
    for (let t = 16; t < 64; t++) {
      const w15 = W[t - 15], w2 = W[t - 2];
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  const out = [h0, h1, h2, h3, h4, h5, h6, h7];
  let s = "";
  for (let i = 0; i < 8; i++) {
    const v = out[i] >>> 0;
    s += HEX[(v >>> 24) & 0xff] + HEX[(v >>> 16) & 0xff] + HEX[(v >>> 8) & 0xff] + HEX[v & 0xff];
  }
  return s;
}
