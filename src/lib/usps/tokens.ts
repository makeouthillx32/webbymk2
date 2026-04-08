// lib/usps/tokens.ts
// Handles USPS OAuth token + Payment Authorization token
// Tokens are cached in-memory for their lifetime (OAuth ~1hr, Payment ~8hr)

const USPS_BASE = 'https://apis.usps.com';
const USPS_TEM  = 'https://apis-tem.usps.com';

function base(): string {
  return process.env.USPS_ENV === 'production' ? USPS_BASE : USPS_TEM;
}

// ── In-memory cache ──────────────────────────────────────────────
let cachedOAuth: { token: string; expiresAt: number } | null = null;
let cachedPayment: { token: string; expiresAt: number } | null = null;

// ── OAuth Token ──────────────────────────────────────────────────
export async function getOAuthToken(): Promise<string> {
  const now = Date.now();
  if (cachedOAuth && cachedOAuth.expiresAt > now + 60_000) {
    return cachedOAuth.token;
  }

  const res = await fetch(`${base()}/oauth2/v3/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.USPS_CONSUMER_KEY,
      client_secret: process.env.USPS_CONSUMER_SECRET,
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`USPS OAuth failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  const expiresIn = Number(data.expires_in) * 1000; // convert seconds → ms

  cachedOAuth = {
    token: data.access_token,
    expiresAt: now + expiresIn,
  };

  return cachedOAuth.token;
}

// ── Payment Authorization Token ──────────────────────────────────
// Valid for 8 hours. Required as X-Payment-Authorization-Token header on label calls.
export async function getPaymentToken(oauthToken: string): Promise<string> {
  const now = Date.now();
  if (cachedPayment && cachedPayment.expiresAt > now + 60_000) {
    return cachedPayment.token;
  }

  const res = await fetch(`${base()}/payments/v3/payment-authorization`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${oauthToken}`,
    },
    body: JSON.stringify({
      roles: [
        {
          roleName: 'PAYER',
          CRID: process.env.USPS_CRID,
          MID: process.env.USPS_MID,
          accountType: process.env.USPS_ACCOUNT_TYPE ?? 'EPS',
          accountNumber: process.env.USPS_ACCOUNT_NUMBER,
        },
        {
          roleName: 'LABEL_OWNER',
          CRID: process.env.USPS_CRID,
          MID: process.env.USPS_MID,
          accountType: process.env.USPS_ACCOUNT_TYPE ?? 'EPS',
          accountNumber: process.env.USPS_ACCOUNT_NUMBER,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`USPS Payment Auth failed ${res.status}: ${text}`);
  }

  const data = await res.json();

  // Payment token is valid 8 hours
  cachedPayment = {
    token: data.paymentAuthorizationToken,
    expiresAt: now + 8 * 60 * 60 * 1000,
  };

  return cachedPayment.token;
}