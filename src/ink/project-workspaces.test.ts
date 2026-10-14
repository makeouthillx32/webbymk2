import { describe, expect, test } from "bun:test";
import { isProjectCheckout, isRemoteUrl, matchWorkspace, toLocalPath, toWindowsPath, workspaceFolderName } from "./project-workspaces.ts";

describe("a project is a record, a workspace is a checkout", () => {
  test("a checkout is recognised by the project's own files, not by UNAXIS's source", () => {
    expect(isProjectCheckout(["docker-compose.yml", "src"])).toBe(true);
    expect(isProjectCheckout([".infisical.json"])).toBe(true);
    expect(isProjectCheckout(["src", "README.md"])).toBe(false);
  });

  test("workspace folders are named from the slug", () => {
    expect(workspaceFolderName("unenter")).toBe("unenter");
    expect(workspaceFolderName("My Site!")).toBe("my-site");
  });

  test("paths are stored in drive-letter form and opened in the local form", () => {
    expect(toWindowsPath("/mnt/c/Users/skill/unaxis/workspaces/unenter")).toBe("C:\\Users\\skill\\unaxis\\workspaces\\unenter");
    expect(toWindowsPath("Z:/WEBSITES/webbymk2")).toBe("Z:\\WEBSITES\\webbymk2");
    expect(toLocalPath("C:\\Users\\skill\\unaxis", "linux")).toBe("/mnt/c/Users/skill/unaxis");
    expect(toLocalPath("C:\\Users\\skill\\unaxis", "win32")).toBe("C:\\Users\\skill\\unaxis");
  });

  test("only real remotes are cloned", () => {
    expect(isRemoteUrl("ssh://git@100.78.83.20:2222/unenter/unenter.live.git")).toBe(true);
    expect(isRemoteUrl("git@forge:unenter/x.git")).toBe(true);
    expect(isRemoteUrl("Z:\\WEBSITES\\webbymk2")).toBe(false);
  });

  test("short ids pick exactly one workspace", () => {
    const all = [{ id: "a0b7bfa2-1" }, { id: "5bfbd81f-2" }, { id: "a0c00000-3" }];
    expect(matchWorkspace(all, "5bf")?.id).toBe("5bfbd81f-2");
    expect(matchWorkspace(all, "a0")).toBeNull();
  });
});
