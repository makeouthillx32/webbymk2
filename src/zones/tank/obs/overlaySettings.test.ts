import { describe, expect, test } from "bun:test";
import {
  overriddenByQuery,
  resolveBoolean,
  resolveNumber,
  resolveText,
  sanitizeSettings,
} from "./overlaySettings";

// The precedence rule is the whole feature: a stable URL pasted into OBS once,
// reconfigured from the console afterwards — WITHOUT silently changing every
// scene that already pins its settings in the query string.

const params = (query: string) => new URLSearchParams(query);

describe("precedence: query > stored > default", () => {
  test("a stored caption is used when the URL says nothing", () => {
    // This is the new capability. Before storage existed, this was the default.
    const r = resolveText("label", params(""), { label: "FROM THE CONSOLE" });
    expect(r.value).toBe("FROM THE CONSOLE");
    expect(r.from).toBe("stored");
  });

  test("a URL caption beats the stored one", () => {
    // Every URL already pasted into OBS carries its settings. If storage won,
    // the first console save would silently change every existing scene.
    const r = resolveText("label", params("label=FROM+THE+URL"), { label: "FROM THE CONSOLE" });
    expect(r.value).toBe("FROM THE URL");
    expect(r.from).toBe("query");
  });

  test("with neither, the built-in default stands", () => {
    const r = resolveText("label", params(""), {});
    expect(r.value).toBeNull();
    expect(r.from).toBe("default");
  });
});

describe("booleans are ON unless explicitly switched off", () => {
  test("an absent flag means ON, not OFF", () => {
    // The single most common misconfiguration in this system: dropping `hud`
    // from a URL does not disable the HUD.
    expect(resolveBoolean("hud", params(""), {}, true).value).toBe(true);
  });

  test("only an explicit off value disables it", () => {
    expect(resolveBoolean("hud", params("hud=0"), {}, true).value).toBe(false);
    expect(resolveBoolean("hud", params("hud=false"), {}, true).value).toBe(false);
    expect(resolveBoolean("hud", params("hud=off"), {}, true).value).toBe(false);
    expect(resolveBoolean("hud", params("hud=1"), {}, true).value).toBe(true);
  });

  test("a stored false is honoured when the URL is silent", () => {
    const r = resolveBoolean("vu", params(""), { vu: false }, true);
    expect(r.value).toBe(false);
    expect(r.from).toBe("stored");
  });

  test("a URL flag still beats a stored one", () => {
    expect(resolveBoolean("vu", params("vu=1"), { vu: false }, true).value).toBe(true);
    expect(resolveBoolean("vu", params("vu=0"), { vu: true }, true).value).toBe(false);
  });
});

describe("numbers", () => {
  test("stored values are used and clamped", () => {
    expect(resolveNumber("duration", params(""), { duration: 400 }, 180, 60, 2000).value).toBe(400);
    expect(resolveNumber("duration", params(""), { duration: 99_999 }, 180, 60, 2000).value).toBe(
      2000,
    );
  });

  test("a non-numeric query value falls through instead of becoming NaN", () => {
    // Otherwise a typo in a URL silently produces NaN and the overlay renders
    // nothing, which looks exactly like the overlay being broken.
    const r = resolveNumber("duration", params("duration=banana"), { duration: 400 }, 180, 60, 2000);
    expect(r.value).toBe(400);
    expect(r.from).toBe("stored");
  });

  test("the default is clamped too", () => {
    expect(resolveNumber("x", params(""), {}, 10_000, 0, 100).value).toBe(100);
  });
});

describe("telling the operator when the URL has pinned a setting", () => {
  test("pinned keys are reported", () => {
    // Without this, someone edits a caption in the console, saves, sees no
    // change on air, and concludes the feature does not work.
    expect(overriddenByQuery(["label", "lock"], params("label=PINNED"))).toEqual(["label"]);
  });

  test("an empty parameter does not count as pinned", () => {
    expect(overriddenByQuery(["label"], params("label="))).toEqual([]);
  });

  test("nothing is pinned when there is no query string at all", () => {
    expect(overriddenByQuery(["label", "lock"], params(""))).toEqual([]);
    expect(overriddenByQuery(["label"], null)).toEqual([]);
  });
});

describe("stored rows are treated as data, not as a schema", () => {
  test("scalars survive", () => {
    expect(sanitizeSettings({ label: "HI", vu: false, duration: 400 })).toEqual({
      label: "HI",
      vu: false,
      duration: 400,
    });
  });

  test("anything else is dropped rather than rejected", () => {
    // A row written by a newer deploy must not brick an older one.
    expect(
      sanitizeSettings({ ok: "yes", nested: { a: 1 }, list: [1], nothing: null, bad: Number.NaN }),
    ).toEqual({ ok: "yes" });
  });

  test("non-objects resolve to empty settings", () => {
    expect(sanitizeSettings(null)).toEqual({});
    expect(sanitizeSettings("nope")).toEqual({});
    expect(sanitizeSettings([1, 2, 3])).toEqual({});
  });
});
