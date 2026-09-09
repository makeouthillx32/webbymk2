import urllib.request
import ssl
import json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

content = """<!-- Promo Grid - Two Cards Side by Side -->
<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
  <!-- Left: $30 Off Promo Card (Dark Luxury Aesthetic) -->
  <a
    href="/shop"
    class="group relative block overflow-hidden rounded-2xl aspect-[4/3] p-8 text-white shadow-sm hover:shadow-lg transition-all duration-300"
    style="background: linear-gradient(135deg, #18181b 0%, #09090b 50%, #1c1917 100%);"
  >
    <div class="absolute -top-16 -left-16 w-56 h-56 bg-white/[0.04] rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute -bottom-16 -right-16 w-56 h-56 bg-amber-500/[0.04] rounded-full blur-3xl pointer-events-none"></div>

    <div class="relative z-10 h-full flex flex-col justify-between">
      <div>
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-white/10 text-white/90 border border-white/10 backdrop-blur-sm mb-4">
          Member Perk
        </span>
        <h3 class="text-3xl md:text-4xl font-extrabold tracking-tight mb-2 text-white">
          Enjoy $30 off
        </h3>
        <p class="text-base md:text-lg text-neutral-300">
          your next order when you complete your first
        </p>
        <p class="text-base md:text-lg font-bold text-white">
          in-app purchase*
        </p>
      </div>

      <div class="pt-4">
        <span class="inline-flex items-center gap-2 text-sm font-semibold text-white/90 group-hover:text-white group-hover:translate-x-1 transition-all">
          Explore collection →
        </span>
      </div>
    </div>
  </a>

  <!-- Right: QR Code / App Waitlist Card (Interactive & Styled) -->
  <div class="group relative rounded-2xl border border-[var(--border)] bg-[var(--card)] aspect-[4/3] p-8 flex flex-col items-center justify-between text-center shadow-sm hover:shadow-md transition-all duration-300">
    <div class="w-full">
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-neutral-100 dark:bg-neutral-800 text-[var(--muted-foreground)] border border-[var(--border)] mb-2">
        Mobile Access
      </span>
      <p class="text-xs uppercase tracking-wider text-[var(--muted-foreground)] font-medium max-w-xs mx-auto">
        Early Access Pass • Unenter Native Mobile App
      </p>
    </div>

    <div class="relative w-36 h-36 rounded-2xl border-2 border-dashed border-[var(--primary)]/30 bg-background/60 backdrop-blur-sm p-3 flex items-center justify-center group-hover:border-[var(--primary)]/70 transition-colors shadow-inner">
      <svg class="w-24 h-24 text-[var(--foreground)]" viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="24" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="4"/>
        <rect x="16" y="16" width="12" height="12" rx="2" fill="currentColor"/>
        <rect x="66" y="10" width="24" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="4"/>
        <rect x="72" y="16" width="12" height="12" rx="2" fill="currentColor"/>
        <rect x="10" y="66" width="24" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="4"/>
        <rect x="16" y="72" width="12" height="12" rx="2" fill="currentColor"/>
        <rect x="42" y="14" width="6" height="6" rx="1"/>
        <rect x="52" y="14" width="6" height="6" rx="1"/>
        <rect x="42" y="24" width="6" height="6" rx="1"/>
        <rect x="48" y="32" width="6" height="6" rx="1"/>
        <rect x="14" y="44" width="6" height="6" rx="1"/>
        <rect x="24" y="44" width="6" height="6" rx="1"/>
        <rect x="34" y="44" width="6" height="6" rx="1"/>
        <rect x="44" y="44" width="12" height="12" rx="2"/>
        <rect x="62" y="44" width="6" height="6" rx="1"/>
        <rect x="72" y="44" width="6" height="6" rx="1"/>
        <rect x="82" y="44" width="6" height="6" rx="1"/>
        <rect x="44" y="62" width="6" height="6" rx="1"/>
        <rect x="54" y="62" width="6" height="6" rx="1"/>
        <rect x="64" y="62" width="6" height="6" rx="1"/>
        <rect x="74" y="62" width="6" height="6" rx="1"/>
        <rect x="84" y="72" width="6" height="6" rx="1"/>
        <rect x="44" y="74" width="6" height="6" rx="1"/>
        <rect x="54" y="80" width="6" height="6" rx="1"/>
        <rect x="64" y="80" width="12" height="6" rx="1"/>
        <rect x="82" y="82" width="8" height="8" rx="1"/>
      </svg>
      <div class="absolute inset-x-3 h-0.5 bg-[var(--primary)]/60 blur-[1px] top-6 animate-pulse pointer-events-none"></div>
    </div>

    <div>
      <p class="text-xs font-semibold tracking-wide uppercase text-[var(--foreground)] mb-1.5">
        Scan to Download
      </p>
      <span class="inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:opacity-90 transition">
        Join the waitlist
      </span>
    </div>
  </div>
</div>"""

url = "https://db.unenter.live/rest/v1/static_pages?slug=eq.landing-qr-download"
data = json.dumps({"content": content}).encode("utf-8")
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.Ywv4meCskGCFWiJyZC08oPvS1r2xlgmSXJ3VGqta4pg"
req = urllib.request.Request(
    url,
    data=data,
    method="PATCH",
    headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    },
)

with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
    print("Updated status:", resp.status)
    print("Response length:", len(resp.read()))
