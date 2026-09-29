import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Tank All Rooms layout", () => {
  test("grid mode never mounts the empty hero at desktop widths", () => {
    const source = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");

    expect(source).toContain('mode === "grid" ? "hidden" : ""');
    expect(source).not.toContain('mode === "grid" ? "hidden lg:block" : ""');
  });

  test("desktop exposes All Rooms and only mounts the camera roster there", () => {
    const source = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");
    const desktopAllRoomsControl = source.indexOf('active={mode === "grid"}');
    const desktopRosterGuard = source.indexOf(
      '{mode === "grid" && (\n              <div className="hidden lg:flex lg:flex-col lg:gap-2">',
    );

    expect(desktopAllRoomsControl).toBeGreaterThan(-1);
    expect(source.slice(desktopAllRoomsControl, desktopAllRoomsControl + 350)).toContain(
      'onClick={() => navigateTo("grid")}',
    );
    expect(source.slice(desktopAllRoomsControl, desktopAllRoomsControl + 350)).toContain(
      "All Rooms",
    );
    expect(desktopRosterGuard).toBeGreaterThan(-1);
    expect(source.slice(desktopRosterGuard, desktopRosterGuard + 500)).toContain(
      "<CameraRosterPanel",
    );
    expect(source.slice(desktopRosterGuard, desktopRosterGuard + 800)).toContain(
      "directorCamera=",
    );
    expect(source).toContain("const directorRosterCamera =");
    expect(source).toContain("const directorSourceCamera = directorCameraId");
    expect(source).toMatch(
      /negotiateDirectorFeed\(\s*rosterCameras,\s*onlineCameraIds,/,
    );
    expect(source).not.toContain("rosterCameras.filter(isCanvasEligible)");
    expect(source).not.toContain("directorProgram.playbackUrl");
    expect(source).not.toContain("usingDirectorProgram");

    const rosterSource = readFileSync(
      join(import.meta.dir, "components", "CameraRosterPanel.tsx"),
      "utf8",
    );
    expect(rosterSource).toContain('roomKey: "__director__"');
    expect(rosterSource).toContain("room.isDirector && hasFeed");
    expect(rosterSource).toContain(
      "room.camera?.previewUrl ?? room.camera?.playbackUrl ?? null",
    );
    expect(rosterSource).toContain(
      "prerollLoopUrl={room.camera?.recentClipUrl ?? null}",
    );
    expect(rosterSource).toContain("<RoomTileCrtHover />");
    expect(rosterSource).toContain("data-tank-room-tile");

    const mobileGridSource = readFileSync(
      join(import.meta.dir, "components", "MobileRoomGrid.tsx"),
      "utf8",
    );
    expect(mobileGridSource).toContain(
      "directorCamera?.previewUrl ??\n                directorCamera?.playbackUrl",
    );
    expect(mobileGridSource).toContain(
      "directorCamera?.recentClipUrl ?? null",
    );
    expect(mobileGridSource.match(/<RoomTileCrtHover \/>/g)).toHaveLength(2);

    const themeStyles = readFileSync(
      join(import.meta.dir, "TankThemeStyles.tsx"),
      "utf8",
    );
    expect(themeStyles).toContain("@keyframes tank-room-crt-noise");
    expect(themeStyles).toContain("@keyframes tank-room-crt-tear");
    expect(themeStyles).toContain("@media (hover: hover) and (pointer: fine)");
    expect(themeStyles).toContain(
      "[data-tank-room-tile]:hover .tank-room-crt-hover",
    );
    expect(themeStyles).toContain("tank-room-crt-burst 300ms linear both");
    expect(themeStyles).not.toContain("tank-room-crt-noise 260ms steps(2, end) infinite");
    expect(themeStyles).not.toContain("tank-room-crt-tear 520ms steps(1, end) infinite");
    expect(themeStyles).not.toContain("tank-room-crt-sweep 720ms linear infinite");
  });

  test("season is standalone while Profile owns Daily Bonus and Merch", () => {
    const experience = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");
    const seasonMarquee = readFileSync(
      join(import.meta.dir, "components", "SeasonMarquee.tsx"),
      "utf8",
    );
    const tankBrand = readFileSync(
      join(import.meta.dir, "components", "TankBrandBlock.tsx"),
      "utf8",
    );
    const profile = readFileSync(
      join(import.meta.dir, "components", "ProfilePanel.tsx"),
      "utf8",
    );

    expect(experience).toContain("<SeasonMarquee season={season} />");
    expect(experience).not.toContain("<TopConsoleStrip");
    expect(seasonMarquee).not.toContain('href="/archives"');
    expect(seasonMarquee).not.toContain("ShoppingBag");
    expect(experience).toContain("<TankBrandBlock />");
    expect(tankBrand).not.toContain("ChromePanel");
    expect(tankBrand).toContain('aria-label="Tank"');
    expect(seasonMarquee).not.toContain("Tank\n");
    expect(experience).toContain(
      "lg:grid-cols-[180px_220px_minmax(0,1fr)]",
    );
    expect(experience).toContain("[scrollbar-width:thin]");
    expect(profile).toContain('aria-label="Tank quick actions"');
    expect(profile).toContain("onClick={onClaimDaily}");
    expect(profile).toContain("href={merchHref}");
    expect(profile).not.toContain("<ChromePanel");
  });

  test("collapsed desktop rails reserve bento columns instead of floating over video", () => {
    const experience = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");
    const chat = readFileSync(
      join(import.meta.dir, "components", "ChatConsolePanel.tsx"),
      "utf8",
    );
    const restore = readFileSync(
      join(import.meta.dir, "components", "CollapsedPanelRestore.tsx"),
      "utf8",
    );

    expect(experience).toContain(
      '"lg:grid-cols-[56px_minmax(0,1fr)_48px]"',
    );
    expect(experience).toContain('<CollapsedPanelRestore\n                label="Panels"');
    expect(experience).toContain("label={`Chat ${onlineCount}`}");
    expect(chat).not.toContain("fixed bottom-3 right-3");
    expect(experience).not.toContain('aria-label="Show panel rail"');
    expect(restore).not.toContain("var(--tank-texture-metal");
    expect(restore).not.toContain("{label}\n");
    expect(restore).toContain('side === "left"');
    expect(restore).toContain('"h-9 w-9 rounded-xl"');
  });

  test("the floating profile dock owns exactly one rail collapse control", () => {
    const experience = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");
    const profile = readFileSync(
      join(import.meta.dir, "components", "ProfilePanel.tsx"),
      "utf8",
    );
    expect(experience).not.toContain("<PanelRailHeader");
    expect(profile).toContain('aria-label="Tank quick actions"');
    expect(profile.match(/aria-label="Hide panels"/g)?.length).toBe(1);
    expect(profile).not.toContain("PanelCollapseButton");
  });

  test("selected desktop feeds have an external back control and no picture overlay", () => {
    const source = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");

    expect(source).toContain('aria-label="Back to All Rooms"');
    expect(source).not.toContain("<DirectorRoomLabel");
    expect(source).not.toContain("<CrtTransition");
    expect(source).not.toContain("<RoomDescriptionPanel");
    expect(source).toContain("data-tank-player-footer");
    expect(source).toContain("ref={heroViewportRef}");
    expect(source).not.toContain("absolute inset-x-0 bottom-0 z-20");
  });

  test("desktop level rail belongs to the feed column instead of following full-height chat", () => {
    const source = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");
    const levelRail = source.indexOf("data-tank-level-rail");
    const rightChat = source.indexOf("Right: chat — sticky on desktop");
    const shellClose = source.indexOf("MOBILE QUICK ACTION PYRAMID DOCK");

    expect(levelRail).toBeGreaterThan(-1);
    expect(levelRail).toBeLessThan(rightChat);
    expect(source.slice(rightChat, shellClose)).not.toContain("data-tank-level-rail");
    expect(source).toContain('className="mt-auto hidden pt-2 lg:block"');
    expect(source).toContain('contentClassName="!px-5 !py-1.5 flex min-h-[42px] items-center gap-3"');
  });

  test("desktop chat supports only open and closed while mobile keeps three stages", () => {
    const experience = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");
    const chat = readFileSync(
      join(import.meta.dir, "components", "ChatConsolePanel.tsx"),
      "utf8",
    );

    expect(chat).toContain('export type MobileChatSize = "hidden" | "half" | "full"');
    expect(chat).toContain('export type DesktopChatSize = "hidden" | "full"');
    expect(chat).toContain('onDesktopSizeChange("hidden")');
    expect(chat).not.toContain("handleDesktopPlusClick");
    expect(experience).toContain('onRestore={() => setDesktopChatSize("full")}');
    expect(experience).not.toContain("lg:h-[50dvh]");
  });

  test("closing both desktop rails activates a viewport-height focus player", () => {
    const source = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");

    expect(source).toContain(
      '!desktopRailVisible && desktopChatSize === "hidden" && mode !== "grid"',
    );
    expect(source).toContain('desktopFocusView ? "lg:h-[calc(100dvh-7.5rem)] lg:min-h-0"');
    expect(source).toContain('desktopFocusView ? "lg:max-w-none" : "max-w-[1800px]"');
    expect(source).toContain('data-tank-focus-stage={desktopFocusView ? "side-rails" : undefined}');
    expect(source).toContain("lg:grid-cols-[8.5rem_minmax(0,1fr)_15rem]");
    expect(source).toContain("lg:col-start-1 lg:row-start-1");
    expect(source).toContain("lg:col-start-2 lg:row-start-1 lg:h-full lg:w-full");
    expect(source).toContain("lg:col-start-3 lg:row-start-1 lg:h-full");
    expect(source).toContain('className="absolute inset-0 h-full w-full object-cover"');
    expect(source).toContain('desktopFocusView ? "lg:!contents" : ""');
    expect(source).toContain("lg:col-start-1 lg:row-start-1 lg:z-10 lg:mb-4 lg:ml-4");
    expect(source).toContain("lg:col-start-3 lg:row-start-1 lg:z-10 lg:mb-3 lg:mr-3");
    expect(source).toContain('desktopFocusView ? "lg:!contents" : ""');
    expect(source).toContain('desktopFocusView ? "flex lg:hidden" : "flex"');
    expect(source).toContain("{desktopFocusView && (");
  });
});
