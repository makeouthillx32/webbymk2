// lib/usps/mailClass.ts
// Maps your shipping_method_name (stored on orders) to USPS API mailClass values.
// Add/edit entries here as you add shipping rate options to your store.

const MAIL_CLASS_MAP: Record<string, string> = {
  // Ground Advantage (formerly First Class Package + Parcel Select Ground)
  'ground advantage':       'USPS_GROUND_ADVANTAGE',
  'usps ground advantage':  'USPS_GROUND_ADVANTAGE',
  'ground':                 'USPS_GROUND_ADVANTAGE',
  'standard':               'USPS_GROUND_ADVANTAGE',
  'standard shipping':      'USPS_GROUND_ADVANTAGE',
  'free shipping':          'USPS_GROUND_ADVANTAGE',
  'economy':                'USPS_GROUND_ADVANTAGE',

  // Priority Mail
  'priority mail':          'PRIORITY_MAIL',
  'priority':               'PRIORITY_MAIL',
  'usps priority':          'PRIORITY_MAIL',
  'usps priority mail':     'PRIORITY_MAIL',
  '2-day':                  'PRIORITY_MAIL',
  '2 day':                  'PRIORITY_MAIL',

  // Priority Mail Express
  'priority mail express':  'PRIORITY_MAIL_EXPRESS',
  'express':                'PRIORITY_MAIL_EXPRESS',
  'overnight':              'PRIORITY_MAIL_EXPRESS',
  'next day':               'PRIORITY_MAIL_EXPRESS',

  // Media / Library (niche but just in case)
  'media mail':             'MEDIA_MAIL',
  'library mail':           'LIBRARY_MAIL',
};

/**
 * Given a shipping method name from the order, return the USPS mailClass.
 * Falls back to USPS_GROUND_ADVANTAGE if no match found.
 */
export function resolveMailClass(shippingMethodName?: string | null): string {
  if (!shippingMethodName) return 'USPS_GROUND_ADVANTAGE';
  const key = shippingMethodName.trim().toLowerCase();
  return MAIL_CLASS_MAP[key] ?? 'USPS_GROUND_ADVANTAGE';
}

/**
 * Default rateIndicator per mail class.
 * SP = Single Piece (most common for small parcels)
 */
export function resolveRateIndicator(mailClass: string): string {
  switch (mailClass) {
    case 'PRIORITY_MAIL_EXPRESS': return 'SP';
    case 'PRIORITY_MAIL':         return 'SP';
    default:                      return 'SP';
  }
}