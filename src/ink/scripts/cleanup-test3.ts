// src/ink/scripts/cleanup-test3.ts
// One-shot script to remove the test3 zone filesystem leftovers.
// The zones were deleted via TUI but the folders couldn't be removed by the
// shell sandbox (Windows permission boundary).  Run from the project root:
//
//   bun src/ink/scripts/cleanup-test3.ts
//
import { rm, access } from "fs/promises";
import { join }       from "path";
import { PROJECT_DIR } from "../../config/stack.ts";

const targets = [
  join(PROJECT_DIR, "zones",     "test3"),
  join(PROJECT_DIR, "src", "zones", "test3"),
];

for (const dir of targets) {
  try {
    await access(dir);
    await rm(dir, { recursive: true, force: true });
    console.log(`✓ Removed ${dir}`);
  } catch {
    console.log(`⚠ Not found (already clean): ${dir}`);
  }
}

console.log("\n✓ Cleanup complete");
