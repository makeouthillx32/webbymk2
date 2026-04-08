export type RegionCode = "US" | "EU" | "UK" | "CA" | "AU" | "NZ" | "JP" | "IN" | "ROW";

export function detectRegionFromTimezone(): RegionCode {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";

    // US timezones
    if (tz.startsWith("America/") && !tz.startsWith("America/Toronto") && !tz.startsWith("America/Vancouver")) {
      // This is a coarse assumption; Canada is also America/*
      // We'll catch common Canada zones below.
    }

    // Canada (common)
    if (
      tz === "America/Toronto" ||
      tz === "America/Vancouver" ||
      tz === "America/Edmonton" ||
      tz === "America/Winnipeg" ||
      tz === "America/Halifax" ||
      tz === "America/St_Johns"
    ) return "CA";

    // US (common)
    if (
      tz === "America/New_York" ||
      tz === "America/Chicago" ||
      tz === "America/Denver" ||
      tz === "America/Los_Angeles" ||
      tz === "America/Phoenix" ||
      tz === "America/Anchorage" ||
      tz === "Pacific/Honolulu"
    ) return "US";

    // UK
    if (tz === "Europe/London") return "UK";

    // EU (coarse Europe)
    if (tz.startsWith("Europe/")) return "EU";

    // AU / NZ
    if (tz.startsWith("Australia/")) return "AU";
    if (tz.startsWith("Pacific/Auckland")) return "NZ";

    // JP / IN
    if (tz === "Asia/Tokyo") return "JP";
    if (tz === "Asia/Kolkata") return "IN";

    return "ROW";
  } catch {
    return "ROW";
  }
}

export function regionToCurrency(region: RegionCode) {
  switch (region) {
    case "US": return "USD";
    case "EU": return "EUR";
    case "UK": return "GBP";
    case "CA": return "CAD";
    case "AU": return "AUD";
    case "NZ": return "NZD";
    case "JP": return "JPY";
    case "IN": return "INR";
    default: return "USD";
  }
}