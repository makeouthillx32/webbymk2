// sandbox/setup-tui.ts
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

const SANDBOX_DIR = resolve("./sandbox");
const MOCK_APPDATA = join(SANDBOX_DIR, "mock-appdata");
const UNENTER_DIR = join(MOCK_APPDATA, "unenter");
const CONFIG_PATH = join(UNENTER_DIR, "config.json");

async function setup() {
  console.log("🛠 Setting up sandbox environment...");

  // 1. Create directory structure
  if (!existsSync(UNENTER_DIR)) {
    await mkdir(UNENTER_DIR, { recursive: true });
    console.log(`✅ Created ${UNENTER_DIR}`);
  }

  // 2. Create mock config.json if it doesn't exist
  if (!existsSync(CONFIG_PATH)) {
    const mockConfig = {
      "_comment": "SANDBOX CONFIG - FOR TESTING ONLY",
      "domain": "sandbox.unenter.live",
      "npm": {
        "ip": "127.0.0.1",
        "port": 81,
        "email": "sandbox@unenter.live",
        "password": "password",
        "leEmail": "sandbox@unenter.live"
      },
      "stack": {
        "ip": "127.0.0.1",
        "proxyPort": 3080
      }
    };
    await writeFile(CONFIG_PATH, JSON.stringify(mockConfig, null, 2), "utf-8");
    console.log(`✅ Created mock config at ${CONFIG_PATH}`);
  }

  console.log("\n🚀 Sandbox ready!");
  console.log("\nTo run the TUI in sandbox mode:");
  console.log(`$env:APPDATA="${MOCK_APPDATA}"; bun run tui:dev`);
}

setup().catch(console.error);
