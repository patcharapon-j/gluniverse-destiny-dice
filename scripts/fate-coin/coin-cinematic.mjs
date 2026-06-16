// The Babylon.js cinematic. The engine is vendored and loaded eagerly via the
// manifest `scripts` array, so the global `BABYLON` is present at startup.
//
// Determinism (§Q5): the landing face of every coin is dictated entirely by
// the broadcast payload. Babylon only *choreographs* an already-decided result
// — nothing here is read back as the outcome.

const RADIUS = 1.0;
const THICKNESS = 0.16;
const FPS = 60;

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
    this.coins = [];
    this._onResize = () => this.engine?.resize();
  }

  async init() {
    const engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: false, stencil: true });
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 0); // CSS vignette shows through.

    const count = this.payload.coins.length;
    const spacing = 2.7;
    const radius = Math.max(7, count * 2.2 + 4);

    const camera = new BABYLON.ArcRotateCamera("glfc-cam", -Math.PI / 2, 0.92, radius, BABYLON.Vector3.Zero(), scene);
    camera.fov = 0.7;
    camera.minZ = 0.1;

    const hemi = new BABYLON.HemisphericLight("glfc-hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.55;
    hemi.diffuse = new BABYLON.Color3(0.8, 0.85, 1.0);
    hemi.groundColor = new BABYLON.Color3(0.05, 0.06, 0.1);

    const key = new BABYLON.DirectionalLight("glfc-key", new BABYLON.Vector3(-0.4, -1, -0.6), scene);
    key.intensity = 1.4;
    key.position = new BABYLON.Vector3(4, 10, 6);

    const rim = new BABYLON.PointLight("glfc-rim", new BABYLON.Vector3(0, 3, -6), scene);
    rim.intensity = 0.6;
    rim.diffuse = new BABYLON.Color3(0.4, 0.7, 1.0);

    const glow = new BABYLON.GlowLayer("glfc-glow", scene);
    glow.intensity = 0.9;

    const materials = this.payload.materials ?? {};
    const labels = this.payload.labels ?? { good: "Boon", bad: "Bane" };

    const edgeMat = this.#buildEdgeMaterial(scene, materials.edge);
    const goodMat = this.#buildFaceMaterial(scene, "good", materials.good, labels.good, true);
    const badMat = this.#buildFaceMaterial(scene, "bad", materials.bad, labels.bad, false);

    const offset = ((count - 1) * spacing) / 2;
    this.payload.coins.forEach((coin, index) => {
      const root = this.#buildCoin(scene, index, edgeMat, goodMat, badMat);
      root.position.x = index * spacing - offset;
      root.position.y = 9; // starts up high for the summon drop
      this.coins.push({ root, spec: coin });
    });

    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", this._onResize);

    this.engine = engine;
    this.scene = scene;

    await this.#playSummon();
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

    return root;
  }

  // --- Choreography -------------------------------------------------------

  #playSummon() {
    return new Promise((resolve) => {
      const ease = new BABYLON.CubicEase();
      ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
      let pending = this.coins.length;
      if (!pending) resolve();
      this.coins.forEach((coin, index) => {
        BABYLON.Animation.CreateAndStartAnimation(
          `glfc-drop-${index}`,
          coin.root,
          "position.y",
          FPS,
          Math.round(FPS * 0.9),
          9,
          0,
          BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT,
          ease,
          () => {
            if (--pending <= 0) resolve();
          },
        );
      });
    });
  }

  // Animate every coin to its predetermined face. Resolves once all settle.
  playToss() {
    return new Promise((resolve) => {
      if (!this.coins.length) {
        resolve();
        return;
      }
      const spinEase = new BABYLON.CubicEase();
      spinEase.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
      const hopEase = new BABYLON.SineEase();
      hopEase.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);

      let pending = this.coins.length;
      this.coins.forEach((coin, index) => {
        const spins = 5 + (coin.spec.spins ?? index % 3); // deterministic from payload
        const target = spins * Math.PI * 2 + (coin.spec.good ? 0 : Math.PI);
        const frames = Math.round(FPS * (1.6 + index * 0.12));

        // Vertical hop for weight.
        const hop = new BABYLON.Animation(`glfc-hop-${index}`, "position.y", FPS, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        hop.setKeys([
          { frame: 0, value: 0 },
          { frame: Math.round(frames * 0.35), value: 3.4 },
          { frame: frames, value: 0 },
        ]);
        hop.setEasingFunction(hopEase);
        coin.root.animations = [hop];
        this.scene.beginAnimation(coin.root, 0, frames, false);

        BABYLON.Animation.CreateAndStartAnimation(
          `glfc-spin-${index}`,
          coin.root,
          "rotation.x",
          FPS,
          frames,
          coin.root.rotation.x,
          target,
          BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT,
          spinEase,
          () => {
            if (--pending <= 0) resolve();
          },
        );
      });
    });
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
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
