import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const panel = readFileSync(join(import.meta.dir, "components", "ChatConsolePanel.tsx"), "utf8");
const experience = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");

describe("closed mobile chat", () => {
  test("leaves no full-width bar over the video", () => {
    expect(panel).not.toContain("fixed inset-x-2 bottom-[3.8rem]");
    expect(panel).not.toContain("LIVE CHAT ({onlineCount} ONLINE)");
  });

  test("landscape gets a corner button (the dock is hidden there), never on desktop", () => {
    const opener = /aria-label=\{`Open chat, \$\{onlineCount\} online`\}[\s\S]*?className="([^"]+)"/.exec(panel);
    expect(opener).not.toBeNull();
    const cls = opener![1].split(/\s+/);
    expect(cls).toContain("hidden");
    expect(cls).toContain("landscape:grid");
    expect(cls).toContain("lg:!hidden");
    expect(cls).not.toContain("inset-x-2");
  });

  test("portrait reopens from the dock's chat button, which shows the online count", () => {
    expect(experience).toContain('ariaLabel={mobileChatSize === "hidden" ? `Open chat, ${onlineCount} online` : "Toggle Chat"}');
  });
});
