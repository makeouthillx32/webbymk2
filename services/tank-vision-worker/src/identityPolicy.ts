/**
 * Identity confidence policy for the live Axis worker.
 *
 * Every pass stays inside the detector's class. A person, cat, or dog is only
 * compared with enrolled profiles from that same class. This deliberately
 * declines uncertain detections instead of allowing a strong coat-colour
 * resemblance to turn a cat into a dog (or vice versa).
 */
export const PERSON_MATCH_THRESHOLDS = {
  minScore: 0.82,
  minMargin: 0.04,
} as const;

export const PET_SAME_CLASS_THRESHOLDS = {
  minScore: 0.82,
  minMargin: 0.06,
} as const;
