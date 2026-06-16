import { getSetting, SETTINGS } from "../settings.mjs";
import {
  COIN_AUTODISMISS_MS,
  COIN_COUNT_MAX,
  COIN_COUNT_MIN,
  COIN_MSG,
  COIN_THRESHOLD_DEFAULT,
} from "./coin-constants.mjs";
import { CoinCinematic, isCinematicSupported } from "./coin-cinematic.mjs";
import { CoinStaticView } from "./coin-fallback.mjs";
import { layoutX, solveThrow } from "./coin-physics.mjs";
import { CoinOverlay } from "./coin-overlay.mjs";
import { postCoinResult } from "./coin-result.mjs";
import { getCoinLabels, getCoinMaterials, getCoinSounds } from "./coin-settings.mjs";
import { emitCoin } from "./coin-socket.mjs";

// One ceremony at a time, globally (§Q15). Tracked per-client; the cinematic
// seizes every screen, so overlapping ceremonies are simply refused.
let active = null;

export function isCeremonyActive() {
  return active !== null;
}

// --- Initiation (GM only) -------------------------------------------------

export async function beginCeremony({ count, threshold, flipperUserId } = {}) {
  if (!game.user.isGM) {
    ui.notifications?.warn(game.i18n.localize("GLFC.Notify.GMOnly"));
    return;
  }
  if (active) {
    ui.notifications?.warn(game.i18n.localize("GLFC.Notify.InProgress"));
    return;
  }

  const safeCount = clamp(Math.round(Number(count) || COIN_COUNT_MIN), COIN_COUNT_MIN, COIN_COUNT_MAX);
  const safeThreshold = clamp(Math.round(Number(threshold) || COIN_THRESHOLD_DEFAULT), 1, safeCount);

  const flipper = game.users.get(flipperUserId);
  if (!flipper?.active) {
    ui.notifications?.warn(game.i18n.localize("GLFC.Notify.FlipperOffline"));
    return;
  }

  // Authoritative, fair 50/50 per coin via a Foundry Roll (§Q5/Q8). The GM then
  // solves a real physics launch that lands on each coin's decided face and
  // broadcasts that exact launch state, so every client replays the same tumble.
  const roll = await new Roll(`${safeCount}d2`).evaluate();
  const dieResults = roll.dice[0]?.results ?? [];
  const coins = Array.from({ length: safeCount }, (_value, index) => {
    const good = (dieResults[index]?.result ?? 1) === 2;
    return { good, throw: solveThrow(layoutX(index, safeCount), good) };
  });

  const payload = {
    id: foundry.utils.randomID(),
    coins,
    count: safeCount,
    threshold: safeThreshold,
    flipperUserId,
    initiatorUserId: game.user.id,
  };

  emitAndLocal(COIN_MSG.start, payload, handleStart);
}

// --- Socket handlers (run on every client) --------------------------------

export async function handleStart(payload) {
  if (active) return; // lock: ignore a second ceremony

  const overlay = new CoinOverlay();
  const { canvas, staticEl } = overlay.mount();

  const useCinematic = isCinematicSupported() && !prefersReducedMotion();
  const viewPayload = { coins: payload.coins, materials: getCoinMaterials(), labels: getCoinLabels() };

  let view;
  if (useCinematic) {
    view = new CoinCinematic(canvas, viewPayload);
  } else {
    view = new CoinStaticView(staticEl, viewPayload);
  }

  active = { payload, overlay, view, useCinematic, tossed: false, autodismiss: null };

  overlay.setStatus(game.i18n.localize("GLFC.Overlay.Summon"));
  playSound(getCoinSounds().windup);

  try {
    await view.init();
  } catch (error) {
    // Cinematic failed mid-setup → fall back to the static panel (§Q12).
    console.error("GLUniverse Fate Coin | cinematic init failed, falling back", error);
    if (!active || active.payload.id !== payload.id) return;
    try { view.dispose(); } catch {}
    overlay.canvas?.setAttribute("hidden", "");
    view = new CoinStaticView(staticEl, viewPayload);
    active.view = view;
    active.useCinematic = false;
    await view.init();
  }

  if (!active || active.payload.id !== payload.id) return;
  presentFlipPhase();
}

function presentFlipPhase() {
  const { overlay, payload } = active;
  overlay.setPhase("flip");
  overlay.clearControls();

  const flipper = game.users.get(payload.flipperUserId);
  const flipperName = flipper?.name ?? game.i18n.localize("GLFC.Overlay.UnknownFlipper");
  const amFlipper = game.user.id === payload.flipperUserId;
  const amGM = game.user.isGM;

  if (amFlipper) {
    overlay.setStatus(game.i18n.localize("GLFC.Overlay.YourFlip"));
    overlay.showFlipButton(game.i18n.localize("GLFC.Overlay.Flip"), triggerToss);
  } else {
    overlay.setStatus(game.i18n.format("GLFC.Overlay.Waiting", { name: flipperName }));
    // GM keeps a force-flip override for AFK / disconnected flippers (§Q11).
    if (amGM) overlay.showForceButton(game.i18n.localize("GLFC.Overlay.ForceFlip"), triggerToss);
  }
}

function triggerToss() {
  if (!active || active.tossed) return;
  emitAndLocal(COIN_MSG.toss, { id: active.payload.id }, handleToss);
}

export async function handleToss(payload) {
  if (!active || active.payload.id !== payload.id || active.tossed) return;
  active.tossed = true;

  const { overlay, view } = active;
  overlay.clearControls();
  overlay.setStatus(game.i18n.localize("GLFC.Overlay.Tossing"));
  playSound(getCoinSounds().toss);

  try {
    await view.playToss();
  } catch (error) {
    console.error("GLUniverse Fate Coin | toss animation failed", error);
  }

  if (!active || active.payload.id !== payload.id) return;
  playSound(getCoinSounds().settle);
  revealVerdict();
}

function revealVerdict() {
  const { payload, overlay } = active;
  const labels = getCoinLabels();
  const coins = payload.coins.map((coin) => coin.good);
  const boonCount = coins.filter(Boolean).length;
  const isBoon = boonCount >= payload.threshold;
  const verdictLabel = isBoon ? labels.good : labels.bad;

  const tally = game.i18n.format("GLFC.Overlay.Tally", {
    boons: boonCount,
    count: payload.count,
    threshold: payload.threshold,
    label: labels.good,
  });

  overlay.showVerdict({ verdictLabel, isBoon, tally, coins, goodLabel: labels.good, badLabel: labels.bad });

  const sounds = getCoinSounds();
  playSound(isBoon ? sounds.boon : sounds.bane);

  // Only the initiating GM writes the chat record (§Q10).
  if (game.user.id === payload.initiatorUserId) {
    postCoinResult({
      isBoon,
      verdictLabel,
      goodLabel: labels.good,
      badLabel: labels.bad,
      boonCount,
      count: payload.count,
      threshold: payload.threshold,
      coins,
      flipperName: game.users.get(payload.flipperUserId)?.name ?? null,
    }).catch((error) => console.error("GLUniverse Fate Coin | failed to post result card", error));
  }

  // GM holds the Continue control; everyone arms the auto-dismiss safety net.
  if (game.user.isGM) {
    overlay.showContinueButton(game.i18n.localize("GLFC.Overlay.Continue"), triggerDismiss);
  } else {
    overlay.setStatus(game.i18n.localize("GLFC.Overlay.AwaitGM"));
  }

  active.autodismiss = window.setTimeout(() => teardown(), COIN_AUTODISMISS_MS);
}

function triggerDismiss() {
  if (!active) return;
  emitAndLocal(COIN_MSG.dismiss, { id: active.payload.id }, handleDismiss);
}

export function handleDismiss(payload) {
  if (!active || active.payload.id !== payload.id) return;
  teardown();
}

// --- Teardown -------------------------------------------------------------

function teardown() {
  if (!active) return;
  const current = active;
  active = null;
  if (current.autodismiss) window.clearTimeout(current.autodismiss);
  try { current.view?.dispose(); } catch (error) { console.warn("GLUniverse Fate Coin | view dispose failed", error); }
  try { current.overlay?.destroy(); } catch (error) { console.warn("GLUniverse Fate Coin | overlay destroy failed", error); }
}

// --- Helpers --------------------------------------------------------------

function emitAndLocal(type, payload, localHandler) {
  // game.socket.emit does not loop back to the sender, so run locally too.
  emitCoin(type, payload);
  localHandler(payload);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function prefersReducedMotion() {
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return true;
  } catch {}
  try {
    return getSetting(SETTINGS.motionTier) === "reduced";
  } catch {
    return false;
  }
}

function playSound(src) {
  if (!src) return;
  try {
    const helper = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
    helper?.play({ src, volume: 0.8, autoplay: true, loop: false }, false);
  } catch (error) {
    console.warn("GLUniverse Fate Coin | failed to play sound", src, error);
  }
}
