// src/lib/shield/template.ts
// ─────────────────────────────────────────────────────────────────────────────
// Generates the in-place zero-redirect HTML verification challenge screen.
// ─────────────────────────────────────────────────────────────────────────────

import { ShieldChallenge } from "./types";

export function renderShieldVerificationHtml(
  challenge: ShieldChallenge,
  serializedChallenge: string
): string {
  const { domain, rayId, difficulty } = challenge;
  const challengeData = `${domain}|${challenge.clientIp}|${challenge.timestamp}|${challenge.nonce}|${difficulty}|${rayId}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${domain} | Security Verification</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #000000;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 3.5rem 1.5rem 2.5rem 1.5rem;
    }
    .content {
      max-width: 520px;
      margin: 0 auto;
      width: 100%;
    }
    h1 {
      font-size: 2.25rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 0.75rem;
      color: #ffffff;
      word-break: break-word;
    }
    h2 {
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      margin-bottom: 1.25rem;
      color: #eeeeee;
    }
    p.desc {
      font-size: 0.95rem;
      line-height: 1.5;
      color: #a0a0a0;
      margin-bottom: 2.5rem;
    }
    .verify-box {
      border: 1px solid #333333;
      background: #111111;
      border-radius: 6px;
      padding: 1.25rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .verify-left {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid rgba(255, 102, 0, 0.2);
      border-top-color: #ff6600;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .verify-text {
      font-size: 0.95rem;
      font-weight: 500;
      color: #e0e0e0;
    }
    .shield-badge {
      text-align: right;
    }
    .shield-brand {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: #ff6600;
      text-transform: uppercase;
    }
    .shield-links {
      font-size: 0.65rem;
      color: #777777;
      margin-top: 2px;
    }
    .shield-links a {
      color: #888888;
      text-decoration: underline;
    }
    .divider {
      border-top: 1px solid #222222;
      margin-top: auto;
      padding-top: 1.5rem;
      max-width: 520px;
      margin-left: auto;
      margin-right: auto;
      width: 100%;
      text-align: center;
    }
    .ray-id {
      font-size: 0.78rem;
      color: #777777;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      margin-bottom: 0.35rem;
    }
    .powered-by {
      font-size: 0.72rem;
      color: #555555;
    }
    .powered-by a {
      color: #777777;
      text-decoration: none;
    }
    .status-msg {
      font-size: 0.8rem;
      color: #ffaa44;
      margin-top: 0.5rem;
      display: none;
    }
  </style>
</head>
<body>
  <div class="content">
    <h1>${domain}</h1>
    <h2>Performing security verification</h2>
    <p class="desc">
      This website uses a security service to protect against malicious bots.
      This page is displayed while the website verifies you are not a bot.
    </p>

    <div class="verify-box">
      <div class="verify-left">
        <div class="spinner" id="spinner"></div>
        <span class="verify-text" id="status-label">Verifying…</span>
      </div>
      <div class="shield-badge">
        <div class="shield-brand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
          </svg>
          UNENTER EDGE
        </div>
        <div class="shield-links">
          <span>Privacy</span> • <span>Help</span>
        </div>
      </div>
    </div>
    <div id="error-box" class="status-msg"></div>
  </div>

  <div class="divider">
    <div class="ray-id">Ray ID: ${rayId}</div>
    <div class="powered-by">
      Performance and Security by <strong>Unenter Edge Shield</strong> | Privacy
    </div>
  </div>

  <script>
    (async function() {
      const challengeToken = "${serializedChallenge}";
      const challengeData = "${challengeData}";
      const difficulty = ${difficulty};
      const statusLabel = document.getElementById("status-label");
      const errorBox = document.getElementById("error-box");
      const targetPrefix = "0".repeat(difficulty);

      // Synchronous, allocation-light SHA-256 (ASCII input only) — replaces
      // the old crypto.subtle.digest()-per-attempt approach entirely. Even
      // batched via Promise.all, WebCrypto's async dispatch overhead per
      // call dominated over the actual hash work at real attempt counts
      // (difficulty 4 averages 65,536 attempts) — that's what hung this
      // page past 5s on 2026-09-04 and got the whole forced-challenge
      // trigger pulled instead of properly fixed. Mirrors
      // src/lib/shield/sha256.ts exactly (verified there against Node's
      // own crypto.createHash across multiple block-boundary lengths) —
      // keep both in sync if this ever changes.
      var SHA256_K = [
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
      ];
      var SHA256_H0 = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
      var SHA256_W = new Array(64);
      var SHA256_HEX = [];
      for (var hx = 0; hx < 256; hx++) SHA256_HEX.push(hx.toString(16).padStart(2, "0"));

      function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

      function padMessage(str) {
        var byteLen = str.length;
        var bitLen = byteLen * 8;
        var totalLen = byteLen + 1;
        while (totalLen % 64 !== 56) totalLen++;
        totalLen += 8;
        var buf = new Uint8Array(totalLen);
        for (var i = 0; i < byteLen; i++) buf[i] = str.charCodeAt(i) & 0xff;
        buf[byteLen] = 0x80;
        var hi = Math.floor(bitLen / 0x100000000);
        var lo = bitLen >>> 0;
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

      function sha256Hex(str) {
        var buf = padMessage(str);
        var h0 = SHA256_H0[0], h1 = SHA256_H0[1], h2 = SHA256_H0[2], h3 = SHA256_H0[3];
        var h4 = SHA256_H0[4], h5 = SHA256_H0[5], h6 = SHA256_H0[6], h7 = SHA256_H0[7];

        for (var blockStart = 0; blockStart < buf.length; blockStart += 64) {
          for (var t = 0; t < 16; t++) {
            var o = blockStart + t * 4;
            SHA256_W[t] = (buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3];
          }
          for (var t2 = 16; t2 < 64; t2++) {
            var w15 = SHA256_W[t2 - 15], w2 = SHA256_W[t2 - 2];
            var s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
            var s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
            SHA256_W[t2] = (SHA256_W[t2 - 16] + s0 + SHA256_W[t2 - 7] + s1) | 0;
          }

          var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
          for (var t3 = 0; t3 < 64; t3++) {
            var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            var ch = (e & f) ^ (~e & g);
            var temp1 = (h + S1 + ch + SHA256_K[t3] + SHA256_W[t3]) | 0;
            var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            var maj = (a & b) ^ (a & c) ^ (b & c);
            var temp2 = (S0 + maj) | 0;
            h = g; g = f; f = e; e = (d + temp1) | 0;
            d = c; c = b; b = a; a = (temp1 + temp2) | 0;
          }
          h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
          h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
        }

        var out = [h0, h1, h2, h3, h4, h5, h6, h7];
        var s = "";
        for (var oi = 0; oi < 8; oi++) {
          var v = out[oi] >>> 0;
          s += SHA256_HEX[(v >>> 24) & 0xff] + SHA256_HEX[(v >>> 16) & 0xff] + SHA256_HEX[(v >>> 8) & 0xff] + SHA256_HEX[v & 0xff];
        }
        return s;
      }

      async function solve() {
        try {
          var solution = 0;
          var CHUNK = 20000;
          while (true) {
            var chunkEnd = solution + CHUNK;
            for (; solution < chunkEnd; solution++) {
              var hash = sha256Hex(challengeData + ":" + solution);
              if (hash.indexOf(targetPrefix) === 0) return solution;
            }
            // Yield to browser event loop so the spinner keeps animating.
            await new Promise(function(r) { setTimeout(r, 0); });
          }
        } catch (e) {
          throw new Error("Proof-of-work solver error");
        }
      }

      try {
        const solution = await solve();
        statusLabel.textContent = "Finalizing…";

        const res = await fetch("/api/shield/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeStr: challengeToken,
            solution: solution,
            rayId: "${rayId}"
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          statusLabel.textContent = "Verified. Redirecting…";
          // In-place refresh: exact same URL, with new clearance cookie!
          window.location.reload();
        } else {
          throw new Error(data.error || "Verification failed");
        }
      } catch (err) {
        document.getElementById("spinner").style.borderTopColor = "#ff4444";
        statusLabel.textContent = "Verification Failed";
        errorBox.style.display = "block";
        errorBox.textContent = err.message + ". Please refresh to try again.";
      }
    })();
  </script>
</body>
</html>`;
}
