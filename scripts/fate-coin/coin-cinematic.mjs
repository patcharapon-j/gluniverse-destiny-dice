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
  makeSettle,
  settleStep,
} from "./coin-physics.mjs";

const RADIUS = PHYS.radius;
const THICKNESS = PHYS.thickness;

const ALIGN_MS = 300; // gentle final settle/correction to the authoritative face

// Steady playback pace: the simulation runs a touch slower than real time for a
// dramatic, weighty tumble (no per-frame slow-motion ramp). This only changes
// how fast we advance through the fixed-timestep sim across wall-clock frames —
// never which steps run or where the coin lands, so determinism is untouched.
const PACE = 0.7;

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
    this._accum = 0; // leftover sub-step time carried between frames
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
    this._glow = glow; // landing decals are excluded so they stay tight, not blooming

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
      this.coins.push({ root, caster, spec, target: !!coin.good, world: null, body: null, settled: false, settle: null, align: null, phaseX: spec.px ?? 0, phaseZ: spec.pz ?? 0 });
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
      // Advance the fixed-timestep sim at a steady, slightly-slowed pace. The
      // step budget is capped so an unusually long frame can't freeze the view.
      this._accum += (dtMs / 1000) * PACE;
      let budget = Math.floor(this._accum / PHYS.dt);
      this._accum -= budget * PHYS.dt;
      if (budget > 8) budget = 8;

      let allDone = true;
      for (const coin of this.coins) {
        if (!coin.world) continue;
        if (!coin.settled) {
          let justSettled = false;
          for (let s = 0; s < budget; s++) {
            coin.world.step(PHYS.dt);
            coin.steps += 1;
            if (settleStep(coin.settle, coin.body, coin.steps)) {
              justSettled = true;
              break;
            }
          }
          this.#syncMesh(coin);
          // Debounced spark burst at the latest impact point.
          if (coin.spark > 0) {
            if (coin.steps - coin.lastSparkStep > 8) {
              this.#spawnSparks(coin);
              coin.lastSparkStep = coin.steps;
            }
            coin.spark = 0;
          }
          if (justSettled) {
            coin.settled = true;
            this.#beginAlign(coin);
            this.#spawnLanding(coin);
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

  // --- Landing effects (verdict-themed) -----------------------------------

  #verdictTint(isGood) {
    return isGood
      ? new BABYLON.Color3(1.0, 0.82, 0.34) // Boon — warm gold
      : new BABYLON.Color3(0.96, 0.22, 0.16); // Bane — deep red
  }

  // Soft glowing annulus (a pulse ring), drawn white on black for additive use.
  #ringTexture() {
    if (this._ringTex) return this._ringTex;
    const size = 256;
    const tex = new BABYLON.DynamicTexture("glfc-ring-tex", size, this.scene, false);
    const ctx = tex.getContext();
    const c = size / 2;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0.0, "#000");
    g.addColorStop(0.48, "#000");
    g.addColorStop(0.62, "#ffffff");
    g.addColorStop(0.78, "#000");
    g.addColorStop(1.0, "#000");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.update(false);
    this._ringTex = tex;
    return tex;
  }

  // Soft filled radial flash (bright core fading out) for the impact bloom.
  #glowTexture() {
    if (this._glowTex) return this._glowTex;
    const size = 256;
    const tex = new BABYLON.DynamicTexture("glfc-glow-tex", size, this.scene, false);
    const ctx = tex.getContext();
    const c = size / 2;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0.0, "#ffffff");
    g.addColorStop(0.25, "#bbbbbb");
    g.addColorStop(0.6, "#222222");
    g.addColorStop(1.0, "#000000");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.update(false);
    this._glowTex = tex;
    return tex;
  }

  // Jagged radial fractures (white core + warm glow) for the Bane landing.
  #crackTexture() {
    if (this._crackTex) return this._crackTex;
    const size = 512;
    const tex = new BABYLON.DynamicTexture("glfc-crack-tex", size, this.scene, false);
    const ctx = tex.getContext();
    const c = size / 2;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const drawCrack = (x, y, ang, length, depth) => {
      const segs = 6;
      const seg = length / segs;
      const pts = [[x, y]];
      const branches = [];
      let px = x;
      let py = y;
      let a = ang;
      for (let i = 0; i < segs; i++) {
        a += (Math.random() - 0.5) * 0.5;
        px += Math.cos(a) * seg;
        py += Math.sin(a) * seg;
        pts.push([px, py]);
        if (depth < 2 && Math.random() < 0.4) {
          const da = (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.5);
          branches.push([px, py, a + da, length * (1 - (i + 1) / segs) * 0.7, depth + 1]);
        }
      }
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      const w = Math.max(1.5, 5 - depth * 1.6);
      ctx.strokeStyle = "rgba(255,130,90,0.45)";
      ctx.lineWidth = w + 5;
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = w;
      ctx.stroke();
      for (const b of branches) drawCrack(b[0], b[1], b[2], b[3], b[4]);
    };

    const mains = 9;
    for (let k = 0; k < mains; k++) {
      const ang = (k / mains) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      drawCrack(c, c, ang, c * 0.9, 0);
    }
    tex.update(false);
    this._crackTex = tex;
    return tex;
  }

  // A flat, additive, circular decal on the ground that scales + fades.
  #pushDecal(tex, tint, x, z, layer, params) {
    const mat = new BABYLON.StandardMaterial(`glfc-decal-mat-${this._clock}-${layer}`, this.scene);
    mat.disableLighting = true;
    mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
    mat.specularColor = new BABYLON.Color3(0, 0, 0);
    mat.emissiveColor = tint;
    mat.emissiveTexture = tex;
    mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
    mat.disableDepthWrite = true;
    mat.backFaceCulling = false;

    const mesh = BABYLON.MeshBuilder.CreateDisc(`glfc-decal-${this._clock}-${layer}`, { radius: 0.5, tessellation: 64 }, this.scene);
    mesh.rotation.x = -Math.PI / 2; // lie flat, facing up
    mesh.position.set(x, 0.02 + layer * 0.004, z);
    mesh.isPickable = false;
    mesh.material = mat;
    this._glow?.addExcludedMesh(mesh); // keep the decal crisp, no extra bloom

    this._ripples.push({ mesh, mat, age: 0, ...params });
  }

  // Verdict-themed landing flourish: a radiant gold pulse for a Boon, spreading
  // red fractures for a Bane. Snappy expand, then fade.
  #spawnLanding(coin) {
    if (!this.scene) return;
    const tint = this.#verdictTint(coin.target);
    const x = coin.body?.position.x ?? coin.phaseX;
    const z = coin.body?.position.z ?? coin.phaseZ;

    // Shared, brief impact bloom — small and close to the coin.
    this.#pushDecal(this.#glowTexture(), tint, x, z, 0, {
      delay: 0, growMs: 130, life: 260, fadeStart: 0, startScale: 0.5, endScale: 1.8, baseAlpha: 0.55,
    });

    if (coin.target) {
      // Boon: a tight luminous pulse ring snapping outward.
      this.#pushDecal(this.#ringTexture(), tint, x, z, 1, {
        delay: 0, growMs: 220, life: 400, fadeStart: 60, startScale: 1.0, endScale: 4.2, baseAlpha: 0.55,
      });
      this.#pushDecal(this.#ringTexture(), tint, x, z, 2, {
        delay: 90, growMs: 260, life: 440, fadeStart: 70, startScale: 0.9, endScale: 3.0, baseAlpha: 0.35,
      });
    } else {
      // Bane: fractures snap outward, with a quick shock ring.
      this.#pushDecal(this.#crackTexture(), tint, x, z, 1, {
        delay: 30, growMs: 200, life: 620, fadeStart: 240, startScale: 0.4, endScale: 3.6, baseAlpha: 0.7,
      });
      this.#pushDecal(this.#ringTexture(), tint, x, z, 2, {
        delay: 0, growMs: 220, life: 380, fadeStart: 50, startScale: 0.9, endScale: 3.2, baseAlpha: 0.5,
      });
    }
  }

  #updateRipples(dtMs) {
    if (!this._ripples.length) return;
    const survivors = [];
    for (const r of this._ripples) {
      r.age += dtMs;
      const local = r.age - r.delay;
      if (local < 0) {
        r.mesh.scaling.set(r.startScale, r.startScale, r.startScale);
        r.mat.alpha = 0;
        survivors.push(r);
        continue;
      }
      const g = Math.min(1, local / r.growMs);
      const scale = r.startScale + (r.endScale - r.startScale) * this.#easeOut(g);
      r.mesh.scaling.set(scale, scale, scale);
      const fade = local <= r.fadeStart ? 1 : 1 - (local - r.fadeStart) / (r.life - r.fadeStart);
      r.mat.alpha = r.baseAlpha * Math.max(0, fade);
      if (local >= r.life) {
        try { r.mesh.dispose(); } catch {}
        try { r.mat.dispose(); } catch {}
      } else {
        survivors.push(r);
      }
    }
    this._ripples = survivors;
  }

  // --- Impact sparks ------------------------------------------------------

  #dotTexture() {
    if (this._dotTex) return this._dotTex;
    const size = 64;
    const tex = new BABYLON.DynamicTexture("glfc-dot-tex", size, this.scene, true);
    const ctx = tex.getContext();
    const c = size / 2;
    ctx.clearRect(0, 0, size, size);
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0.0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.85)");
    g.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.hasAlpha = true;
    tex.update(true);
    this._dotTex = tex;
    return tex;
  }

  // One-shot additive spark burst at a coin's current impact point.
  #spawnSparks(coin) {
    if (!this.scene) return;
    const strength = coin.spark;
    const tint = this.#verdictTint(coin.target);
    const p = coin.body.position;
    const count = Math.max(6, Math.min(26, Math.round(strength * 2.2)));

    const ps = new BABYLON.ParticleSystem(`glfc-spark-${this._clock}`, 48, this.scene);
    ps.particleTexture = this.#dotTexture();
    ps.emitter = new BABYLON.Vector3(p.x, Math.max(p.y, 0.06), p.z);
    ps.minEmitBox = new BABYLON.Vector3(-0.05, 0, -0.05);
    ps.maxEmitBox = new BABYLON.Vector3(0.05, 0.05, 0.05);
    ps.color1 = new BABYLON.Color4(1, 1, 1, 1);
    ps.color2 = new BABYLON.Color4(tint.r, tint.g, tint.b, 1);
    ps.colorDead = new BABYLON.Color4(tint.r, tint.g, tint.b, 0);
    ps.minSize = 0.05;
    ps.maxSize = 0.17;
    ps.minLifeTime = 0.18;
    ps.maxLifeTime = 0.44;
    ps.emitRate = 0;
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new BABYLON.Vector3(0, -34, 0);
    ps.direction1 = new BABYLON.Vector3(-1.3, 1.4, -1.3);
    ps.direction2 = new BABYLON.Vector3(1.3, 3.0, 1.3);
    ps.minEmitPower = 3;
    ps.maxEmitPower = 7.5;
    ps.updateSpeed = 0.016;
    ps.manualEmitCount = count;
    ps.start();
    window.setTimeout(() => {
      try { ps.dispose(); } catch {}
    }, 700);
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
    // The scene has no environment/IBL map, and a fully-metallic PBR surface has
    // no diffuse term — it renders almost black, hiding any uploaded art. Keep
    // the faces semi-metallic dielectrics so the albedo, bump (normal map), and
    // emission read true under the scene lights while still looking coin-like.
    if (maps.texture) {
      mat.albedoTexture = this.#safeTexture(scene, maps.texture);
      mat.metallic = 0.35; // let the user's art read clearly
      mat.roughness = 0.45;
    } else {
      mat.albedoTexture = this.#proceduralFace(scene, label, isGood);
      mat.metallic = 0.55; // a bit more sheen for the default minted look
      mat.roughness = 0.4;
    }

    if (maps.bump) {
      const bump = this.#safeTexture(scene, maps.bump);
      if (bump) {
        mat.bumpTexture = bump;
        mat.invertNormalMapX = false;
        mat.invertNormalMapY = false;
      }
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
    mat.metallic = 0.55; // semi-metallic so the edge reads without an IBL map
    mat.roughness = 0.5;
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
        const ctx = buildWorld(coin.spec.cx ?? 0);
        coin.world = ctx.world;
        coin.body = buildBody(ctx, coin.spec);
        coin.settled = false;
        coin.settle = makeSettle();
        coin.steps = 0;
        coin.spark = 0;
        coin.lastSparkStep = -999;
        // Throw a spark burst on every solid impact (render-only feedback).
        coin.body.addEventListener("collide", (e) => {
          const v = Math.abs(e.contact?.getImpactVelocityAlongNormal?.() ?? 0);
          if (v > 2) coin.spark = Math.max(coin.spark, v);
        });
        this.#syncMesh(coin);
      }
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
    this._glow = null;
    this.coins = [];
    this._ripples = [];
    this._ringTex = null;
    this._glowTex = null;
    this._crackTex = null;
    this._dotTex = null;
  }
}
