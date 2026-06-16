import { MODULE_ID } from "./coin-constants.mjs";
import { buildFateCoinApi } from "./coin-api.mjs";
import { registerCoinControls } from "./coin-controls.mjs";
import { registerCoinSettings } from "./coin-settings.mjs";
import { registerCoinSocket } from "./coin-socket.mjs";

// Wires up the system-agnostic Fate Coin feature. Called from main.mjs at init.
// The feature touches no PF2e API and runs regardless of the active system.
export function registerFateCoin() {
  registerCoinSettings();
  registerCoinControls();

  Hooks.once("ready", () => {
    registerCoinSocket();

    const module = game.modules.get(MODULE_ID);
    if (module) module.api = { ...(module.api ?? {}), fateCoin: buildFateCoinApi() };

    if (typeof BABYLON === "undefined") {
      console.warn("GLUniverse Fate Coin | Babylon.js global not found — cinematic will use the static fallback.");
    } else {
      console.log("GLUniverse Fate Coin | ready (Babylon.js detected)");
    }
  });
}
