// src/lib/pricing.ts
//
// Shared "$/mg" helper for research-chemical storefront cards.
// Parses a dosage_label like "15mg", "10mg/10mg", "300mg/15mg/15mg" into a
// total-mg figure (summing multi-compound blends) and divides price by it.
// Pure-volume labels ("15ml", "10ml") have no mg basis and return null.

export function parseTotalMg(dosageLabel: string | null | undefined): number | null {
  if (!dosageLabel) return null;
  const label = dosageLabel.toLowerCase();
  if (label.includes("ml") && !label.includes("mg")) return null;

  const matches = label.match(/([0-9]+(?:\.[0-9]+)?)\s*mg/g);
  if (!matches || matches.length === 0) return null;

  const total = matches.reduce((sum, m) => {
    const n = parseFloat(m.replace(/mg/i, ""));
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);

  return total > 0 ? total : null;
}

export function formatPricePerMg(
  priceCents: number | null | undefined,
  dosageLabel: string | null | undefined,
  currency: string = "USD",
): string | null {
  if (!priceCents || priceCents <= 0) return null;
  const totalMg = parseTotalMg(dosageLabel);
  if (!totalMg) return null;

  const perMg = priceCents / 100 / totalMg;
  const formatted = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: perMg < 1 ? 2 : 2,
  }).format(perMg);

  return `${formatted}/mg`;
}
