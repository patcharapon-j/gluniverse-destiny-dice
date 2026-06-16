import { MODULE_ID } from "../constants.mjs";

// The Fate Coin is a standalone, system-agnostic ceremony. It deliberately
// shares NONE of the PF2e-bound fate-die plumbing — it only borrows the GL
// "Etched Glass" design tokens for its chat card and degraded panel.

export { MODULE_ID };

// Core-socket channel. Foundry namespaces module sockets as `module.<id>`.
export const COIN_SOCKET = `module.${MODULE_ID}`;

// Socket message types (the `t` field on every coin payload).
export const COIN_MSG = {
  start: "fate-coin:start", // initiator → all: open overlay, summon coins
  toss: "fate-coin:toss", // flipper/GM → all: play the choreographed flip
  dismiss: "fate-coin:dismiss", // GM → all: clear the overlay everywhere
};

export const COIN_FACE_GOOD = "good";
export const COIN_FACE_BAD = "bad";

// Screen-real-estate cap (§Q8). Five tumbling coins is already a lot.
export const COIN_COUNT_MIN = 1;
export const COIN_COUNT_MAX = 5;
export const COIN_COUNT_DEFAULT = 1;

// Per-flip "Boons required" threshold default (§Q9). 1 == "any Boon wins".
export const COIN_THRESHOLD_DEFAULT = 1;

// Verdict auto-dismiss safety net (§Q11/Q15) — if the GM never clicks
// Continue (or vanishes), every client clears itself after this long.
export const COIN_AUTODISMISS_MS = 30000;

// Default labels (§Q7). GM-renameable.
export const COIN_LABEL_GOOD_DEFAULT = "Boon";
export const COIN_LABEL_BAD_DEFAULT = "Bane";

// Settings keys (registered in coin-settings.mjs). All world-scope/GM.
export const COIN_SETTINGS = {
  labelGood: "coinLabelGood",
  labelBad: "coinLabelBad",

  goodTexture: "coinGoodTexture",
  goodBump: "coinGoodBump",
  goodEmissive: "coinGoodEmissive",

  badTexture: "coinBadTexture",
  badBump: "coinBadBump",
  badEmissive: "coinBadEmissive",

  edgeTexture: "coinEdgeTexture",

  soundWindup: "coinSoundWindup",
  soundToss: "coinSoundToss",
  soundSettle: "coinSoundSettle",
  soundBoon: "coinSoundBoon",
  soundBane: "coinSoundBane",
};
