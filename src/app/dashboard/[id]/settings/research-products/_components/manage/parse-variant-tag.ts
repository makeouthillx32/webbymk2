// Parses a dosage/variant label and image type ("photo" vs "lab_report")
// out of a filename or a manually-typed tag, so a bulk drag-and-drop of
// vial photos + lab report images can auto-sort themselves onto the right
// variant instead of being assigned one at a time.
//
// Examples:
//   "VIP-10MG-Vial.png"      -> { label: "10mg", imageType: "photo" }
//   "10mg-labs.webp"         -> { label: "10mg", imageType: "lab_report" }
//   "20mg-Labs-COA.jpg"      -> { label: "20mg", imageType: "lab_report" }
//   "tirzepatide-5mg.webp"   -> { label: "5mg",  imageType: "photo" }
//   "random-photo.jpg"       -> { label: "random-photo", imageType: "photo" } (fallback)

const DOSAGE_RE = /(\d+(?:\.\d+)?)\s?(mg|mcg|ml|iu|kg|g)\b/i;
const LAB_REPORT_RE = /[-_ ]?(labs?|coa|report|certificate)\b/i;

export type ParsedTag = {
  label: string; // normalized dosage/variant label, e.g. "10mg"
  imageType: "photo" | "lab_report";
  matchedDosage: boolean; // false = fell back to raw filename, needs review
};

export function parseVariantTag(raw: string): ParsedTag {
  const base = raw.replace(/\.[a-z0-9]+$/i, ""); // strip extension
  const isLabReport = LAB_REPORT_RE.test(base);

  const dosageMatch = base.match(DOSAGE_RE);
  if (dosageMatch) {
    const label = `${dosageMatch[1]}${dosageMatch[2].toLowerCase()}`;
    return { label, imageType: isLabReport ? "lab_report" : "photo", matchedDosage: true };
  }

  // No recognizable dosage token — fall back to a cleaned-up version of the
  // whole name so there's still something sane to edit rather than upload
  // ungrouped.
  const cleaned = base
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return { label: cleaned || "untitled", imageType: isLabReport ? "lab_report" : "photo", matchedDosage: false };
}
