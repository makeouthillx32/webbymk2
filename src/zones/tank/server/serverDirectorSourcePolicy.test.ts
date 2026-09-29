import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("server Director source policy", () => {
  test("standby admits live user OBS and IRL cameras", () => {
    const source = readFileSync(
      join(import.meta.dir, "serverDirectorEngine.ts"),
      "utf8",
    );

    expect(source).toContain("if (onlineCameras.length > 0)");
    expect(source).toContain('camera.protocol === "rtmp"');
    expect(source).toContain('camera.protocol === "srt"');
    expect(source).toContain('camera.protocol === "srtla"');
    expect(source).toContain("const priorityCam = irlPriorityCam ?? obsPriorityCam");
    expect(source).toContain(
      'subjectMode === "rotation" && onlineCameras.length > 0',
    );
    expect(source).toContain("onlineCameras.map((c) => c.id)");
  });

  test("does not consume the reserved admin program input", () => {
    const source = readFileSync(
      join(import.meta.dir, "serverDirectorEngine.ts"),
      "utf8",
    );

    expect(source).not.toContain("DIRECTOR_PROGRAM_SLUG");
    expect(source).not.toContain("directorProgram.playbackUrl");
  });
});
