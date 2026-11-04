import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { TILE_METRES, finishFor, projectWorldUvs, surfaceShades, type SurfaceTexture } from "./houseFinish";
import { prepareScene } from "./sceneMaterials";

const color = (name: string, material = "") => finishFor(name, material)?.color ?? null;

describe("house finishes", () => {
  test("the real house's surfaces, by Blender name", () => {
    // Floors: carpet where Blender says carpet, laminate elsewhere.
    expect(finishFor("V5_floor_Living_room", "PXSTYLE_v10_soft_dark_carpet")?.texture).toBe("carpet");
    expect(finishFor("V5_floor_Foyer", "PXSTYLE_v10_warm_wood")?.texture).toBe("wood");
    // Walls are white board panelling, whatever material Blender gave them.
    expect(finishFor("V5 trace 12", "PXSTYLE_v10_warm_wall")?.texture).toBe("panel");
    expect(finishFor("AUDIT_kitchen_north_wall_east")?.texture).toBe("panel");
    // Living room: dark leather sectional, cream barrel chair, marble table.
    expect(finishFor("REF curved sectional base 0")?.texture).toBe("leather");
    expect(color("AUDIT_living_barrel_chair")).toBe("#ddd5c6");
    expect(finishFor("Oval coffee table — Tank")?.texture).toBe("marble");
    expect(color("Coffee table angled leg")).toBe("#1f1f21");
    // Keyboards no longer wear the wall texture.
    expect(color("V6 pixel key.012", "PXSTYLE_wall")).toBe("#1b1b1e");
    expect(finishFor("PX_GamingDesk_17")?.texture).toBe("butcher");
  });

  test("order: specific things before the generic ones they contain", () => {
    expect(color("AUDIT microwave glass")).toBe("#202124"); // not glass
    expect(finishFor("V5 entry glass")?.unlit).toBe(true);
    expect(color("PX_Fridge_Handle")).toBe("#1c1c1e"); // a handle, not the fridge
    expect(color("AUDIT_game_alcove_minifridge_body")).toBe("#ecebe5"); // cabinetry
    expect(color("AUDIT_kitchen_fridge_upper_cab")).toBe("#ecebe5");
    expect(color("AUDIT under sofa light")).toBe("#8f63ff"); // a glow, not the sofa
    expect(color("DETAIL stool leg")).toBe("#1d1d20");
    expect(color("AUDIT_game_bath_door_jamb_n")).not.toBeNull();
  });

  test("art and unknown objects keep Blender's look", () => {
    expect(finishFor("AUDIT wall art color")).toBeNull();
    expect(finishFor("AUDIT foyer wall art frame")).toBeNull();
    expect(finishFor("Table cup")).toBeNull();
  });

  test("shoes and books vary, but the same object always gets the same colour", () => {
    const shoes = new Set(Array.from({ length: 20 }, (_, i) => color(`AUDIT shoe.${String(i).padStart(3, "0")}`)));
    expect(shoes.size).toBeGreaterThan(2);
    expect(color("AUDIT shoe.004")).toBe(color("AUDIT shoe.004"));
  });

  test("surface tiles are in range and average near 0.9", () => {
    for (const kind of Object.keys(TILE_METRES) as SurfaceTexture[]) {
      const { size, shades } = surfaceShades(kind);
      expect(shades.length).toBe(size * size);
      let sum = 0;
      for (const v of shades) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        sum += v;
      }
      expect(sum / shades.length).toBeGreaterThan(0.78);
      expect(sum / shades.length).toBeLessThan(0.96);
    }
  });

  test("world UVs: a floor tiles by metres and a shared geometry is not touched", () => {
    const geometry = new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2);
    const a = new THREE.Mesh(geometry);
    a.position.set(1.2, 0, 1.2);
    a.updateMatrixWorld(true);
    projectWorldUvs(a, 2.4);
    expect(a.geometry).not.toBe(geometry);
    const uv = a.geometry.attributes.uv as THREE.BufferAttribute;
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    expect(Math.min(...us)).toBeCloseTo(0);
    expect(Math.max(...us)).toBeCloseTo(1);
  });
});

describe("prepareScene", () => {
  const scene = () => {
    const root = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.1), new THREE.MeshStandardMaterial({ name: "PXSTYLE_wall" }));
    wall.userData.name = "V5 trace 3";
    const sprite = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial());
    sprite.name = "tyler_sprite";
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial());
    screen.userData.name = "PX_TV_Screen";
    root.add(wall, sprite, screen);
    return { root, wall, sprite, screen };
  };
  const lights = (root: THREE.Object3D) => root.children.filter((c) => c.name === "tank house lights").length;

  test("the shell is lit once; sprites and screens stay unlit", () => {
    const { root, wall, sprite, screen } = scene();
    prepareScene(root);
    prepareScene(root);
    expect((wall.material as THREE.MeshLambertMaterial).isMeshLambertMaterial).toBe(true);
    expect((wall.material as THREE.MeshLambertMaterial).map).not.toBeNull();
    expect((sprite.material as THREE.MeshBasicMaterial).isMeshBasicMaterial).toBe(true);
    expect((screen.material as THREE.MeshBasicMaterial).isMeshBasicMaterial).toBe(true);
    expect(lights(root)).toBe(1);
  });

  test("the cast's own file: no finishes, no second set of lights", () => {
    const { root, wall } = scene();
    prepareScene(root, { shell: false });
    expect((wall.material as THREE.MeshBasicMaterial).isMeshBasicMaterial).toBe(true);
    expect(lights(root)).toBe(0);
  });
});
