import { useCallback } from "react";
import { spawn } from "child_process";
import { join } from "path";
import { resolveRuntimeProjectRoot } from "../../utils/runtimeEnv.js";

type RunOpQueued = (
  title: string,
  run: (onLine: (line: string) => void) => Promise<number> | number,
  priority?: "now" | "next" | "later",
) => void;

type UseDevBuildActionsParams = {
  runOpQueued: RunOpQueued;
  addNotification: (message: string, type?: "success" | "error" | "info") => void;
};

function runInkScript(scriptName: string, args: string[]) {
  return (onLine: (line: string) => void) => new Promise<number>((resolve) => {
    const root = resolveRuntimeProjectRoot();
    if (!root) {
      onLine("Project root not found");
      resolve(1);
      return;
    }

    const inkDir = join(root, "src", "ink");
    const scriptPath = join(inkDir, scriptName);
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: inkDir,
      env: { ...process.env, FORCE_COLOR: "0" },
      shell: false,
    });

    const pipe = (data: Buffer) =>
      data.toString().split("\n").forEach((line) => line.trim() && onLine(line));

    child.stdout.on("data", pipe);
    child.stderr.on("data", pipe);
    child.on("error", (err) => {
      onLine("spawn error: " + err.message);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 0));
  });
}

export function useDevBuildActions({
  runOpQueued,
  addNotification,
}: UseDevBuildActionsParams) {
  const handleRelease = useCallback(() => {
    if (!resolveRuntimeProjectRoot()) {
      addNotification("Project root not found - cannot release");
      return;
    }
    runOpQueued("Release UNAXIS", runInkScript("release.ts", ["--publish"]), "next");
  }, [runOpQueued, addNotification]);

  const handleBuild = useCallback(() => {
    if (!resolveRuntimeProjectRoot()) {
      addNotification("Project root not found - cannot build");
      return;
    }
    runOpQueued("Build UNAXIS (local)", runInkScript("build.ts", []), "next");
  }, [runOpQueued, addNotification]);

  return {
    handleRelease,
    handleBuild,
  };
}
