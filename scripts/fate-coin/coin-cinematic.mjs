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
    this._timeScale = 0.85; // cinematic pacing, eased toward slow-mo near landing
    this._accum = 0;
    this._ripples = []; // expanding surface shockwaves spawned on landing
    this._rippleTex = null;
    this._tossResolve = null;
    this._onResize = () => this.engine?.resize();
  }

  async init() {
    const engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: false, stencil: true });
    const scene = new BABYLON.Scene(engine);
    scene.useRightHandedSystem = true; // match cannon-es so we can copy transforms directly
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 0); // CSS vignette shows through

    const count = this.payload.coins.length;
    // Near top-down view, like Foundry's dice: we look straight down at the
    // landing spot, and the coins arc up toward the camera as they flip.
    const radius = Math.max(18, count * 3 + 13);

    const camera = new BABYLON.ArcRotateCamera("glfc-cam", -Math.PI / 2, 0.12, radius, new BABYLON.Vector3(0, 0, 0), scene);
    camera.fov = 0.7;
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
    this.#updateRipples(dtMs);

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
      // Cinematic pacing: ease toward slow-motion as the coins shed energy, so
      // the landing draws out tensely. Pacing only changes how fast we advance
      // through the fixed-timestep sim across wall-clock frames — never which
      // steps run or where the coin lands, so determinism is untouched.
      let maxEnergy = 0;
      for (const coin of this.coins) {
        if (coin.world && !coin.settled) {
          maxEnergy = Math.max(maxEnergy, coin.body.velocity.length() + coin.body.angularVelocity.length());
        }
      }
      this._timeScale += (this.#scaleForEnergy(maxEnergy) - this._timeScale) * 0.1;
      this._accum += (dtMs / 1000) * this._timeScale;
      const budget = Math.min(8, Math.floor(this._accum / PHYS.dt));
      this._accum -= budget * PHYS.dt;

      let allDone = true;
      for (const coin of this.coins) {
        if (!coin.world) continue;
        if (!coin.settled) {
          for (let s = 0; s < budget; s++) {
            coin.world.step(PHYS.dt);
            coin.steps += 1;
            if (isAtRest(coin.body)) {
              if (++coin.quiet >= REST_FRAMES) break;
            } else {
              coin.quiet = 0;
            }
            if (coin.steps >= PHYS.maxSteps) break;
          }
          this.#syncMesh(coin);
          if (coin.quiet >= REST_FRAMES || coin.steps >= PHYS.maxSteps) {
            coin.settled = true;
            this.#beginAlign(coin);
            this.#spawnRipple(coin);
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

  // Map remaining kinetic energy to a playback speed: full-tilt while tumbling,
  // deep slow-motion as a coin approaches rest.
  #scaleForEnergy(energy) {
    const hi = 12;
    const lo = 2.0;
    const fast = 0.85;
    const slow = 0.22;
    if (energy >= hi) return fast;
    if (energy <= lo) return slow;
    return slow + ((fast - slow) * (energy - lo)) / (hi - lo);
  }

  // --- Surface ripple -----------------------------------------------------

  // A soft white annulus on black; under additive blending the black adds
  // nothing, so only a glowing ring shows — tinted per verdict via emissiveColor.
  #rippleTexture() {
    if (this._rippleTex) return this._rippleTex;
    const size = 256;
    const tex = new BABYLON.DynamicTexture("glfc-ripple-tex", size, this.scene, false);
    const ctx = tex.getContext();
    const c = size / 2;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0.0, "#000");
    g.addColorStop(0.5, "#000");
    g.addColorStop(0.66, "#ffffff");
    g.addColorStop(0.82, "#000");
    g.addColorStop(1.0, "#000");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.update(false);
    this._rippleTex = tex;
    return tex;
  }

  // Spawn a short burst of concentric shockwaves from a settled coin.
  #spawnRipple(coin) {
    if (!this.scene) return;
    const tint = coin.target
      ? new BABYLON.Color3(1.0, 0.8, 0.32) // Boon — warm gold
      : new BABYLON.Color3(0.95, 0.2, 0.16); // Bane — deep red
    const x = coin.body?.position.x ?? coin.phaseX;
    const z = coin.body?.position.z ?? coin.phaseZ;
    const tex = this.#rippleTexture();

    for (let i = 0; i < 3; i++) {
      const mat = new BABYLON.StandardMaterial(`glfc-ripple-mat-${this._clock}-${i}`, this.scene);
      mat.disableLighting = true;
      mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
      mat.specularColor = new BABYLON.Color3(0, 0, 0);
      mat.emissiveColor = tint;
      mat.emissiveTexture = tex;
      mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
      mat.disableDepthWrite = true;
      mat.backFaceCulling = false;

      const mesh = BABYLON.MeshBuilder.CreateGround(`glfc-ripple-${this._clock}-${i}`, { width: 1, height: 1 }, this.scene);
      mesh.material = mat;
      mesh.position.set(x, 0.015 + i * 0.004, z);
      mesh.isPickable = false;

      this._ripples.push({
        mesh,
        mat,
        age: 0,
        delay: i * 150,
        life: 1150,
        startScale: 1.8,
        endScale: 13 - i * 1.5,
        baseAlpha: 0.9 - i * 0.18,
      });
    }
  }

  #updateRipples(dtMs) {
    if (!this._ripples.length) return;
    const survivors = [];
    for (const r of this._ripples) {
      r.age += dtMs;
      if (r.age < r.delay) {
        r.mesh.scaling.set(r.startScale, 1, r.startScale);
        r.mat.alpha = 0;
        survivors.push(r);
        continue;
      }
      const t = Math.min(1, (r.age - r.delay) / r.life);
      const eased = 1 - Math.pow(1 - t, 3);
      const scale = r.startScale + (r.endScale - r.startScale) * eased;
      r.mesh.scaling.set(scale, 1, scale);
      r.mat.alpha = r.baseAlpha * (1 - t);
      if (t >= 1) {
        try { r.mesh.dispose(); } catch {}
        try { r.mat.dispose(); } catch {}
      } else {
        survivors.push(r);
      }
    }
    this._ripples = survivors;
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
      this._timeScale = 0.85;
      this._accum = 0;
      this._tossResolve = resolve;
      this._phase = "sim";

      // Safety net: never hang the ceremony if a client can't reach rest.
      const guardMs = 30000;
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
    this._ripples = [];
    this._rippleTex = null;
  }
}
