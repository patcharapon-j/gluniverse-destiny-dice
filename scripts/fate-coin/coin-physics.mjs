// Real rigid-body physics for the Fate Coin, powered by the vendored cannon-es
// engine. The flip is a genuine simulation — the coin is launched with linear
// and angular velocity, arcs under gravity, bounces off the floor with
// restitution and friction, tumbles, and settles flat — not a scripted tween.
//
// Determinism (§Q5): cannon-es stepping is bit-deterministic given identical
// initial conditions and a fixed timestep. The GM *solves* a launch that lands
// on the authoritative face (rejection sampling), broadcasts that exact launch
// state, and every client replays the same simulation step-for-step, so all
// screens see the same physical tumble landing on the same — already decided —
// face. `alignQuaternion` provides a belt-and-suspenders correction in the rare
// event a client's floating-point path diverges.

import * as CANNON from "../vendor/cannon-es.js";

export const PHYS = {
  // Fixed simulation timestep. The renderer advances a deterministic number of
  // these steps each frame (paced for cinematic effect), so the outcome is
  // independent of a client's display framerate.
  dt: 1 / 120,
  maxSteps: 2600, // hard cap before we force a settle

  radius: 0.8,
  thickness: 0.13,
  mass: 1,
  restitution: 0.76, // very bouncy — lots of lively impacts before it settles
  friction: 0.18, // low, so spin doesn't skitter the coin off-screen
  gravity: 14, // floaty, for a long, tense hang time

  // Launch envelope. Coins start hovering at PRESENT_Y, then are thrown upward
  // with a strong horizontal-axis spin so they flip like a tossed coin. A high,
  // slow arc (low gravity) gives the flip room to breathe. Horizontal velocity
  // is deliberately tiny so the coin bounces in place rather than flying away.
  presentY: 5.0,
  upMin: 9.0,
  upMax: 11.0,
  spinMin: 13,
  spinMax: 24,

  // Invisible containment box (per coin) so an energetic bounce can never leave
  // the frame. Applied identically in the solve and the replay.
  wallR: 4.5,
  wallH: 16,

  // Side-by-side layout spacing for multi-coin flips.
  spacing: 2.7,

  // Rest detection thresholds (squared speeds) and how many consecutive quiet
  // steps confirm a settle.
  restLinSq: 0.0025,
  restAngSq: 0.0025,
  restFrames: 36,
};

const LOCAL_UP = new CANNON.Vec3(0, 1, 0);

export function layoutX(index, count) {
  return index * PHYS.spacing - ((count - 1) * PHYS.spacing) / 2;
}

// One isolated world per coin: independent simulations cannot interfere, which
// keeps every coin's outcome reproducible on its own. `centerX` positions the
// floor/containment box around the coin's lane and MUST match in solve & replay.
export function buildWorld(centerX = 0) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -PHYS.gravity, 0) });
  world.broadphase = new CANNON.NaiveBroadphase();
  world.allowSleep = false;
  world.solver.iterations = 14;

  const coinMat = new CANNON.Material("glfc-coin");
  const groundMat = new CANNON.Material("glfc-ground");
  world.addContactMaterial(
    new CANNON.ContactMaterial(coinMat, groundMat, {
      restitution: PHYS.restitution,
      friction: PHYS.friction,
    }),
  );

  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: groundMat });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // normal points +Y
  world.addBody(ground);

  // Four invisible walls boxing the coin in (lower restitution so they nudge
  // rather than fling it back).
  const wallMat = new CANNON.Material("glfc-wall");
  world.addContactMaterial(
    new CANNON.ContactMaterial(coinMat, wallMat, { restitution: 0.2, friction: 0.1 }),
  );
  const r = PHYS.wallR;
  const h = PHYS.wallH;
  const walls = [
    { pos: [centerX + r, h / 2, 0], half: [0.5, h / 2, r + 1] },
    { pos: [centerX - r, h / 2, 0], half: [0.5, h / 2, r + 1] },
    { pos: [centerX, h / 2, r], half: [r + 1, h / 2, 0.5] },
    { pos: [centerX, h / 2, -r], half: [r + 1, h / 2, 0.5] },
  ];
  for (const w of walls) {
    const body = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(w.half[0], w.half[1], w.half[2])),
      material: wallMat,
    });
    body.position.set(w.pos[0], w.pos[1], w.pos[2]);
    world.addBody(body);
  }

  return { world, coinMat };
}

export function buildBody(ctx, throwSpec) {
  const shape = new CANNON.Cylinder(PHYS.radius, PHYS.radius, PHYS.thickness, 36);
  const body = new CANNON.Body({ mass: PHYS.mass, shape, material: ctx.coinMat });
  body.angularDamping = 0.11; // bleed off flat spins so it doesn't twirl forever
  body.linearDamping = 0.01;
  ctx.world.addBody(body);
  if (throwSpec) applyThrow(body, throwSpec);
  return body;
}

export function applyThrow(body, t) {
  body.position.set(t.px, t.py, t.pz);
  body.quaternion.set(t.qx, t.qy, t.qz, t.qw);
  body.velocity.set(t.vx, t.vy, t.vz);
  body.angularVelocity.set(t.ax, t.ay, t.az);
  body.force.setZero();
  body.torque.setZero();
  body.previousPosition.copy(body.position);
  body.interpolatedPosition.copy(body.position);
  body.previousQuaternion.copy(body.quaternion);
  body.interpolatedQuaternion.copy(body.quaternion);
  body.wakeUp();
}

// True when the coin's good face (local +Y) points up.
export function goodFaceUp(body) {
  const n = body.quaternion.vmult(LOCAL_UP);
  return n.y >= 0;
}

export function isAtRest(body) {
  return (
    body.velocity.lengthSquared() < PHYS.restLinSq &&
    body.angularVelocity.lengthSquared() < PHYS.restAngSq
  );
}

// A randomized launch. The big horizontal-axis component (ax) is what makes the
// coin flip face-over-face; smaller y/z spin adds natural wobble.
function randomThrow(x, rand, scratch) {
  scratch.setFromEuler((rand() - 0.5) * 0.6, rand() * Math.PI * 2, (rand() - 0.5) * 0.6);
  return {
    cx: x, // lane center — replay must rebuild the world around the same point
    px: x + (rand() - 0.5) * 0.3,
    py: PHYS.presentY,
    pz: (rand() - 0.5) * 0.3,
    qx: scratch.x,
    qy: scratch.y,
    qz: scratch.z,
    qw: scratch.w,
    vx: (rand() - 0.5) * 0.6,
    vy: PHYS.upMin + rand() * (PHYS.upMax - PHYS.upMin),
    vz: (rand() - 0.5) * 0.6,
    ax: (PHYS.spinMin + rand() * (PHYS.spinMax - PHYS.spinMin)) * (rand() < 0.5 ? -1 : 1),
    ay: (rand() - 0.5) * 4,
    az: (rand() - 0.5) * 4,
  };
}

// Headless rejection sampling (GM only): keep throwing until the coin settles on
// the requested face, then return that exact launch state to broadcast. Each
// trial uses a fresh world/body so it reproduces precisely what a client does
// when it later replays the chosen throw.
export function solveThrow(x, targetGood, rand = Math.random) {
  let last = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    const ctx = buildWorld(x);
    const scratch = new CANNON.Quaternion();
    const spec = randomThrow(x, rand, scratch);
    const body = buildBody(ctx, spec);
    last = spec;

    let settled = false;
    let quiet = 0;
    for (let step = 0; step < PHYS.maxSteps; step++) {
      ctx.world.step(PHYS.dt);
      if (isAtRest(body)) {
        if (++quiet >= PHYS.restFrames) {
          settled = true;
          break;
        }
      } else {
        quiet = 0;
      }
    }

    if (settled && goodFaceUp(body) === targetGood) return spec;
  }
  // Extremely unlikely to fall through; the client-side align will correct it.
  return last;
}

export { CANNON };
