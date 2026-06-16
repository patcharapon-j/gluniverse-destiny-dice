// The Babylon.js cinematic, driven by a real cannon-es rigid-body simulation.
// The engine and physics are vendored and loaded eagerly via the manifest, so
// the global `BABYLON` and the cannon-es module are present at startup.
//
// Babylon only *renders* the simulation — each frame the coin meshes copy their
// transform from the physics bodies. The landing face is dictated by the
// broadcast launch state (solved by the GM to match the authoritative roll),
// so every client tumbles and settles identically. See coin-physics.mjs.

import {
  PHYS,
  buildWorld,
  buildBody,
  goodFaceUp,
  isAtRest,
} from "./coin-physics.mjs";

const RADIUS = PHYS.radius;
const THICKNESS = PHYS.thickness;

const ALIGN_MS = 300; // gentle final settle/correction to the authoritative face
const REST_FRAMES = PHYS.restFrames;

export function isCinematicSupported() {
  if (typeof BABYLON === "undefined" || !BABYLON.Engine) return false;
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") || probe.getContext("webgl");
    return !!gl;
  } catch {
    return false;
  }
}

export class CoinCinematic {
  constructor(canvas, payload) {
    this.canvas = canvas;
    this.payload = payload;
    this.engine = null;
    this.scene = null;
    this.shadow = null;
    this.coins = [];
    this._phase = "idle"; // idle → sim → done
    this._clock = 0;
    this._tossResolve = null;
    this._onResize = () => this.engine?.resize();
  }

  async init() {
    const engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: false, stencil: true });
    const scene = new BABYLON.Scene(engine);
    scene.useRightHandedSystem = true; // match cannon-es so we can copy transforms directly
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 0); // CSS vignette shows through

    const count = this.payload.coins.length;
    const radius = Math.max(9, count * 2.4 + 6);

    const camera = new BABYLON.ArcRotateCamera("glfc-cam", -Math.PI / 2, 1.15, radius, new BABYLON.Vector3(0, 1.6, 0), scene);
    camera.fov = 0.75;
    camera.minZ = 0.1;

    const hemi = new BABYLON.HemisphericLight("glfc-hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.55;
    hemi.diffuse = new BABYLON.Color3(0.8, 0.85, 1.0);
    hemi.groundColor = new BABYLON.Color3(0.05, 0.06, 0.1);

    const key = new BABYLON.DirectionalLight("glfc-key", new BABYLON.Vector3(-0.35, -1, -0.55), scene);
    key.intensity = 1.4;
    key.position = new BABYLON.Vector3(5, 12, 7);

    const rim = new BABYLON.PointLight("glfc-rim", new BABYLON.Vector3(0, 3, -6), scene);
    rim.intensity = 0.6;
    rim.diffuse = new BABYLON.Color3(0.4, 0.7, 1.0);

    const glow = new BABYLON.GlowLayer("glfc-glow", scene);
    glow.intensity = 0.9;

    // Shadow pool under the coins sells the physical landing.
    const shadow = new BABYLON.ShadowGenerator(1024, key);
    shadow.useBlurExponentialShadowMap = true;
    shadow.blurScale = 2;
    shadow.darkness = 0.45;
    this.shadow = shadow;

    const groundSize = Math.max(20, count * PHYS.spacing + 14);
    const ground = BABYLON.MeshBuilder.CreateGround("glfc-ground", { width: groundSize, height: groundSize }, scene);
    const groundMat = new BABYLON.StandardMaterial("glfc-ground-mat", scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.02, 0.03, 0.05);
    groundMat.specularColor = new BABYLON.Color3(0, 0, 0);
    groundMat.alpha = 0.32;
    ground.material = groundMat;
    ground.receiveShadows = true;

    const materials = this.payload.materials ?? {};
    const labels = this.payload.labels ?? { good: "Boon", bad: "Bane" };
    const edgeMat = this.#buildEdgeMaterial(scene, materials.edge);
    const goodMat = this.#buildFaceMaterial(scene, "good", materials.good, labels.good, true);
    const badMat = this.#buildFaceMaterial(scene, "bad", materials.bad, labels.bad, false);

    this.payload.coins.forEach((coin, index) => {
      const { root, caster } = this.#buildCoin(scene, index, edgeMat, goodMat, badMat);
      const spec = coin.throw ?? {};
      root.position.set(spec.px ?? 0, PHYS.presentY, spec.pz ?? 0);
      root.rotationQuaternion = BABYLON.Quaternion.Identity();
      shadow.addShadowCaster(caster, true);
      this.coins.push({ root, caster, spec, target: !!coin.good, world: null, body: null, settled: false, quiet: 0, align: null, phaseX: spec.px ?? 0, phaseZ: spec.pz ?? 0 });
    });

    scene.onBeforeRenderObservable.add(() => this.#onFrame());
    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", this._onResize);

    this.engine = engine;
    this.scene = scene;
  }

  // --- Per-frame driver ---------------------------------------------------

  #onFrame() {
    const dtMs = this.engine?.getDeltaTime?.() ?? 16.7;
    this._clock += dtMs;

    if (this._phase === "idle") {
      // Coins hover and turn slowly while awaiting the flip.
      const t = this._clock / 1000;
      this.coins.forEach((coin, i) => {
        coin.root.position.x = coin.phaseX;
        coin.root.position.z = coin.phaseZ;
        coin.root.position.y = PHYS.presentY + Math.sin(t * 1.4 + i) * 0.12;
        BABYLON.Quaternion.RotationYawPitchRollToRef(t * 0.8 + i, Math.sin(t + i) * 0.15, 0, coin.root.rotationQuaternion);
      });
      return;
    }

    if (this._phase === "sim") {
      let allDone = true;
      for (const coin of this.coins) {
        if (!coin.world) continue;
        if (!coin.settled) {
          for (let s = 0; s < PHYS.stepsPerFrame; s++) {
            coin.world.step(PHYS.dt);
            coin.steps = (coin.steps ?? 0) + 1;
            if (isAtRest(coin.body)) {
              if (++coin.quiet >= REST_FRAMES) break;
            } else {
              coin.quiet = 0;
            }
          }
          this.#syncMesh(coin);
          if (coin.quiet >= REST_FRAMES || coin.steps >= PHYS.maxSteps) {
            coin.settled = true;
            this.#beginAlign(coin);
          } else {
            allDone = false;
          }
        }
        if (coin.align && !this.#advanceAlign(coin, dtMs)) allDone = false;
      }
      if (allDone && this._tossResolve) {
        this._phase = "done";
        const done = this._tossResolve;
        this._tossResolve = null;
        done();
      }
    }
  }

  #syncMesh(coin) {
    const p = coin.body.position;
    const q = coin.body.quaternion;
    coin.root.position.set(p.x, p.y, p.z);
    coin.root.rotationQuaternion.set(q.x, q.y, q.z, q.w);
  }

  // Capture the settled pose and the perfectly-flat, authoritative-face pose;
  // #advanceAlign slerps between them. When physics already matched (the common
  // case) this is an imperceptible flatten; if a client diverged it corrects.
  #beginAlign(coin) {
    const from = coin.root.rotationQuaternion.clone();
    const euler = from.toEulerAngles();
    const to = BABYLON.Quaternion.RotationYawPitchRoll(euler.y, coin.target ? 0 : Math.PI, 0);
    coin.align = { from, to, t: 0 };
  }

  #advanceAlign(coin, dtMs) {
    coin.align.t = Math.min(1, coin.align.t + dtMs / ALIGN_MS);
    const e = BABYLON.Quaternion.Slerp(coin.align.from, coin.align.to, this.#easeOut(coin.align.t));
    coin.root.rotationQuaternion.copyFrom(e);
    coin.root.position.y = THICKNESS / 2;
    if (coin.align.t >= 1) {
      coin.align = null;
      return true;
    }
    return false;
  }

  #easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // --- Materials ----------------------------------------------------------

  #buildFaceMaterial(scene, id, maps = {}, label, isGood) {
    const mat = new BABYLON.PBRMaterial(`glfc-${id}-mat`, scene);
    mat.metallic = 1.0;
    mat.roughness = 0.34;

    if (maps.texture) {
      mat.albedoTexture = this.#safeTexture(scene, maps.texture);
    } else {
      mat.albedoTexture = this.#proceduralFace(scene, label, isGood);
      mat.metallic = 0.92;
      mat.roughness = 0.3;
    }

    if (maps.bump) {
      const bump = this.#safeTexture(scene, maps.bump);
      if (bump) mat.bumpTexture = bump;
    }

    if (maps.emissive) {
      const emissive = this.#safeTexture(scene, maps.emissive);
      if (emissive) {
        mat.emissiveTexture = emissive;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.emissiveIntensity = 1.0;
      }
    } else {
      mat.emissiveColor = isGood
        ? new BABYLON.Color3(0.55, 0.42, 0.12)
        : new BABYLON.Color3(0.4, 0.07, 0.07);
      mat.emissiveIntensity = 0.7;
    }

    mat.backFaceCulling = false;
    return mat;
  }

  #buildEdgeMaterial(scene, maps = {}) {
    const mat = new BABYLON.PBRMaterial("glfc-edge-mat", scene);
    mat.metallic = 1.0;
    mat.roughness = 0.45;
    if (maps?.texture) {
      mat.albedoTexture = this.#safeTexture(scene, maps.texture);
    } else {
      mat.albedoColor = new BABYLON.Color3(0.62, 0.58, 0.42);
    }
    return mat;
  }

  #safeTexture(scene, path) {
    try {
      return new BABYLON.Texture(path, scene, false, false);
    } catch (error) {
      console.warn("GLUniverse Fate Coin | failed to load texture", path, error);
      return null;
    }
  }

  // A drawn-in-engine default coin face so the feature works with zero uploads.
  #proceduralFace(scene, label, isGood) {
    const size = 512;
    const tex = new BABYLON.DynamicTexture(`glfc-proc-${isGood ? "good" : "bad"}`, size, scene, true);
    const ctx = tex.getContext();
    const c = size / 2;

    const base = ctx.createRadialGradient(c, c * 0.8, 40, c, c, c);
    if (isGood) {
      base.addColorStop(0, "#fff6d8");
      base.addColorStop(0.5, "#e9c45c");
      base.addColorStop(1, "#7a5a1e");
    } else {
      base.addColorStop(0, "#5a1f22");
      base.addColorStop(0.5, "#321016");
      base.addColorStop(1, "#120608");
    }
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(c, c, c - 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 14;
    ctx.strokeStyle = isGood ? "#fff1c0" : "#7a3a3a";
    ctx.beginPath();
    ctx.arc(c, c, c - 28, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = isGood ? "#3a2a08" : "#ffd9d2";
    ctx.font = `bold ${Math.round(size * 0.2)}px "Oxanium", "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(label || "").toUpperCase().slice(0, 8), c, c);

    tex.update(true);
    return tex;
  }

  // --- Geometry -----------------------------------------------------------

  #buildCoin(scene, index, edgeMat, goodMat, badMat) {
    const root = new BABYLON.TransformNode(`glfc-coin-${index}`, scene);

    const body = BABYLON.MeshBuilder.CreateCylinder(
      `glfc-body-${index}`,
      { height: THICKNESS, diameter: RADIUS * 2, tessellation: 72 },
      scene,
    );
    body.material = edgeMat;
    body.parent = root;

    const good = BABYLON.MeshBuilder.CreateDisc(
      `glfc-good-${index}`,
      { radius: RADIUS, tessellation: 72 },
      scene,
    );
    good.rotation.x = -Math.PI / 2;
    good.position.y = THICKNESS / 2 + 0.002;
    good.material = goodMat;
    good.parent = root;

    const bad = BABYLON.MeshBuilder.CreateDisc(
      `glfc-bad-${index}`,
      { radius: RADIUS, tessellation: 72 },
      scene,
    );
    bad.rotation.x = Math.PI / 2;
    bad.position.y = -THICKNESS / 2 - 0.002;
    bad.material = badMat;
    bad.parent = root;

    return { root, caster: body };
  }

  // --- Toss ---------------------------------------------------------------

  // Launch every coin with its broadcast initial conditions and run the real
  // simulation until all settle (then align). Resolves when the table is still.
  playToss() {
    return new Promise((resolve) => {
      if (!this.coins.length) {
        resolve();
        return;
      }
      for (const coin of this.coins) {
        const ctx = buildWorld();
        coin.world = ctx.world;
        coin.body = buildBody(ctx, coin.spec);
        coin.settled = false;
        coin.quiet = 0;
        coin.steps = 0;
        this.#syncMesh(coin);
      }
      this._tossResolve = resolve;
      this._phase = "sim";

      // Safety net: never hang the ceremony if a client can't reach rest.
      const guardMs = (PHYS.maxSteps * PHYS.dt * 1000) / PHYS.stepsPerFrame + 2000;
      this._guard = window.setTimeout(() => {
        if (this._tossResolve) {
          for (const coin of this.coins) {
            if (!coin.settled) {
              coin.settled = true;
              this.#beginAlign(coin);
            }
          }
        }
      }, guardMs);
    });
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    if (this._guard) window.clearTimeout(this._guard);
    try {
      this.scene?.dispose();
    } catch {}
    try {
      this.engine?.stopRenderLoop();
      this.engine?.dispose();
    } catch {}
    this.scene = null;
    this.engine = null;
    this.coins = [];
  }
}
