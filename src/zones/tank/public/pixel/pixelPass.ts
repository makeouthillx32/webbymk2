// The house's pixel-art look, as a render pass. Blender's textures are pixel
// art already, but drawn at screen resolution with no light they read as a
// flat 3D model. This draws the scene at a low resolution and finishes it the
// way a pixel artist would:
//   - a dark outline where a nearer surface overlaps a farther one (depth),
//     and a lit rim on the near side of edges facing the top-left light,
//   - contact shadows in corners and under furniture (a small depth AO),
//   - a little depth haze, a warm-highlight / cool-shadow grade,
//   - posterized color with ordered (Bayer) dithering, and a vignette,
// then scales it up nearest-neighbour so every pixel is a crisp block. The
// cast's sprites and the pixel effects are pixel art already and skip all of
// this (CRISP_LAYER).
//
// Plain three.js: render(renderer, scene, camera) replaces renderer.render.

import * as THREE from "three";

/**
 * Objects on this layer (the cast's sprites, the pixel effects) are pixel art
 * already: they skip the low-res pass and are drawn at full resolution on top,
 * still hidden by whatever stands in front of them.
 */
export const CRISP_LAYER = 5;

/** Screen pixels per art pixel. */
export const DEFAULT_PIXEL_SIZE = 2;
const MIN_HEIGHT = 96;
const MAX_HEIGHT = 540;

/** The art resolution for a view of `width` x `height` screen pixels. */
export function artSize(width: number, height: number, pixelSize = DEFAULT_PIXEL_SIZE): { width: number; height: number } {
  const h = Math.round(THREE.MathUtils.clamp(height / Math.max(1, pixelSize), MIN_HEIGHT, MAX_HEIGHT));
  const w = Math.max(1, Math.round((h * Math.max(1, width)) / Math.max(1, height)));
  return { width: w, height: h };
}

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const compose = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float near;
uniform float far;
uniform float ortho;
uniform vec3 outline;
uniform vec3 haze;
varying vec2 vUv;

float linearDepth(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  if (ortho > 0.5) return near + d * (far - near);
  return (near * far) / (far - d * (far - near));
}
vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = y * 4 + x;
  float m[16];
  m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;
  m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
  float v = 0.0;
  for (int k = 0; k < 16; k++) if (k == i) v = m[k];
  return (v + 0.5) / 16.0;
}

void main() {
  vec3 c = toSrgb(texture2D(tColor, vUv).rgb);
  float raw = texture2D(tDepth, vUv).x;
  float d = linearDepth(vUv);
  bool sky = raw >= 0.9999;

  // Edges from the depth's second difference, so a floor sloping away is
  // never outlined but a step in depth always is. Far side of an edge ->
  // outline; near side facing the top-left light -> a lit rim.
  float rel = 0.06;
  float r = linearDepth(vUv + vec2(texel.x, 0.0));
  float le = linearDepth(vUv - vec2(texel.x, 0.0));
  float up = linearDepth(vUv + vec2(0.0, texel.y));
  float dn = linearDepth(vUv - vec2(0.0, texel.y));
  float lapX = (r + le - 2.0 * d) / d;
  float lapY = (up + dn - 2.0 * d) / d;
  float behind = (lapX < -rel || lapY < -rel) ? 1.0 : 0.0;
  // The near side of an edge is the object's own silhouette: lit where the
  // farther side is up or left (the light), a darker shade of itself (a
  // pixel artist's selective outline) where it is down or right.
  bool nearX = !sky && lapX > rel;
  bool nearY = !sky && lapY > rel;
  float rim = ((nearX && le > r) || (nearY && up > dn)) ? 1.0 : 0.0;
  float selout = ((nearX && le <= r) || (nearY && up <= dn)) ? 1.0 : 0.0;

  // Contact shadow: how much of a small ring around this pixel is nearer
  // (corners, under tables, where walls meet floors). Far jumps don't count.
  float occ = 0.0;
  if (!sky) {
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      vec2 o = vec2(cos(a), sin(a)) * texel * 3.0;
      float n = linearDepth(vUv + o);
      float diff = d - n;
      occ += step(0.04, diff) * (1.0 - smoothstep(0.4, 1.2, diff));
    }
    occ /= 8.0;
  }
  c *= 1.0 - 0.3 * occ;

  // Grade: a touch of contrast and saturation, warm lights, cool shadows.
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = pow(c, vec3(0.95));
  c = mix(vec3(l), c, 1.06);
  c = (c - 0.5) * 1.04 + 0.5;
  c += mix(vec3(-0.006, -0.002, 0.015), vec3(0.015, 0.006, -0.01), smoothstep(0.15, 0.75, l));

  // Depth haze: the far side of a room settles back.
  if (!sky) c = mix(c, haze, smoothstep(5.0, 18.0, d) * 0.22);

  if (selout > 0.5) c *= 0.74;
  else if (rim > 0.5 && behind < 0.5) c = c * 1.08 + 0.015;
  if (behind > 0.5) c = mix(c, outline, 0.32);

  // Vignette, then posterize through the ordered dither.
  vec2 v = vUv - 0.5;
  c *= 1.0 - 0.18 * smoothstep(0.36, 0.8, length(v * vec2(1.15, 1.0)));
  float levels = 48.0;
  c = floor(clamp(c, 0.0, 1.0) * levels + bayer(gl_FragCoord.xy)) / levels;
  gl_FragColor = vec4(c, 1.0);
}`;

const blit = /* glsl */ `
precision highp float;
uniform sampler2D tArt;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tArt, vUv).rgb, 1.0); }`;

export class PixelPass {
  private readonly scene: THREE.WebGLRenderTarget;
  private readonly art: THREE.WebGLRenderTarget;
  private readonly composeMaterial: THREE.ShaderMaterial;
  private readonly blitMaterial: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private width = 1;
  private height = 1;

  constructor() {
    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.UnsignedIntType;
    this.scene = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture,
      depthBuffer: true,
    });
    this.art = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    this.composeMaterial = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: compose,
      uniforms: {
        tColor: { value: this.scene.texture },
        tDepth: { value: depthTexture },
        texel: { value: new THREE.Vector2(1, 1) },
        near: { value: 0.1 },
        far: { value: 100 },
        ortho: { value: 0 },
        outline: { value: new THREE.Color(0x0b0d16) },
        haze: { value: new THREE.Color(0x141a2a) },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.blitMaterial = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: blit,
      uniforms: { tArt: { value: this.art.texture } },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composeMaterial);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /** Size to a view of width x height screen (CSS) pixels. */
  setSize(width: number, height: number, pixelSize = DEFAULT_PIXEL_SIZE) {
    const size = artSize(width, height, pixelSize);
    if (size.width === this.width && size.height === this.height) return;
    this.width = size.width;
    this.height = size.height;
    this.scene.setSize(size.width, size.height);
    this.art.setSize(size.width, size.height);
    (this.composeMaterial.uniforms.texel.value as THREE.Vector2).set(1 / size.width, 1 / size.height);
  }

  get size() {
    return { width: this.width, height: this.height };
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera) {
    const previous = renderer.getRenderTarget();
    const u = this.composeMaterial.uniforms;
    const c = camera as THREE.PerspectiveCamera & THREE.OrthographicCamera;
    u.near.value = c.near ?? 0.1;
    u.far.value = c.far ?? 100;
    u.ortho.value = c.isOrthographicCamera ? 1 : 0;

    // Already-pixel-art objects sit out the low-res pass.
    const crisp: THREE.Object3D[] = [];
    scene.traverseVisible((o) => {
      if (o.layers.isEnabled(CRISP_LAYER) && ((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite)) crisp.push(o);
    });
    for (const o of crisp) o.visible = false;

    renderer.setRenderTarget(this.scene);
    renderer.clear();
    renderer.render(scene, camera);

    this.quad.material = this.composeMaterial;
    renderer.setRenderTarget(this.art);
    renderer.render(this.quadScene, this.quadCamera);

    this.quad.material = this.blitMaterial;
    renderer.setRenderTarget(previous);
    renderer.render(this.quadScene, this.quadCamera);

    if (crisp.length) this.renderCrisp(renderer, scene, camera, crisp);
  }

  /**
   * The crisp objects at full resolution: first the rest of the scene into the
   * depth buffer only (so a sofa still hides a sprite behind it), then just
   * the crisp layer, untouched by tone mapping like the pass itself.
   */
  private renderCrisp(renderer: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera, crisp: THREE.Object3D[]) {
    const autoClear = renderer.autoClear;
    const toneMapping = renderer.toneMapping;
    const outputColorSpace = renderer.outputColorSpace;
    const mask = camera.layers.mask;
    // A colour background clears the screen on every render, even with
    // autoClear off: it would wipe the pixelated house we just drew.
    const owner = scene as THREE.Scene;
    const background = owner.isScene ? owner.background : null;
    if (owner.isScene) owner.background = null;
    renderer.autoClear = false;
    renderer.clearDepth();
    // Depth only: render it the way the low-res pass does (no tone mapping,
    // linear output) so every material reuses that pass's shader.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    const muted: THREE.Material[] = [];
    scene.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (m.colorWrite) {
          m.colorWrite = false;
          muted.push(m);
        }
      }
    });
    renderer.render(scene, camera);
    for (const m of muted) m.colorWrite = true;

    for (const o of crisp) o.visible = true;
    camera.layers.set(CRISP_LAYER);
    renderer.outputColorSpace = outputColorSpace;
    renderer.render(scene, camera);

    camera.layers.mask = mask;
    renderer.toneMapping = toneMapping;
    renderer.autoClear = autoClear;
    if (owner.isScene) owner.background = background;
  }

  dispose() {
    this.scene.depthTexture?.dispose();
    this.scene.dispose();
    this.art.dispose();
    this.composeMaterial.dispose();
    this.blitMaterial.dispose();
    this.quad.geometry.dispose();
  }
}
