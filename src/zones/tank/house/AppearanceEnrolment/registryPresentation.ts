export type IdentityCoverage = {
  level: "robust" | "growing" | "seeded" | "reference-only" | "missing";
  label: "ROBUST" | "GROWING" | "SEEDED" | "REFERENCE ONLY" | "NO DATA";
  detail: string;
};

/**
 * Turn private identity-index counts into language a staff operator can read.
 * This deliberately describes evidence coverage, not recognition accuracy:
 * only a measured evaluation set can make an accuracy claim.
 */
export function describeIdentityCoverage(input: {
  references: number;
  confirmedSamples: number;
}): IdentityCoverage {
  if (input.confirmedSamples >= 10) {
    return {
      level: "robust",
      label: "ROBUST",
      detail: "Broad camera-domain coverage across multiple confirmed views.",
    };
  }
  if (input.confirmedSamples >= 3) {
    return {
      level: "growing",
      label: "GROWING",
      detail:
        "Several confirmed camera views are available; more variety will help.",
    };
  }
  if (input.confirmedSamples >= 1) {
    return {
      level: "seeded",
      label: "SEEDED",
      detail: "At least one confirmed camera view supports this identity.",
    };
  }
  if (input.references >= 1) {
    return {
      level: "reference-only",
      label: "REFERENCE ONLY",
      detail:
        "A reference image exists, but no confirmed CCTV view is indexed yet.",
    };
  }
  return {
    level: "missing",
    label: "NO DATA",
    detail: "No usable identity evidence is currently indexed.",
  };
}

export function humanizeIdentitySource(sourceKind: string | null): string {
  switch (sourceKind) {
    case "archive-reviewed":
      return "Archive review";
    case "reference-image":
      return "Reference photo";
    case "live-capture":
      return "Live camera";
    case "trained-model":
      return "Trained model";
    default:
      return "Unspecified source";
  }
}
