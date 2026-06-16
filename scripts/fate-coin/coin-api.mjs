import { beginCeremony } from "./coin-ceremony.mjs";
import { openCoinDialog } from "./coin-controls.mjs";

// Stable macro/script surface (§Q14):
//   game.modules.get("gluniverse-destiny-dice").api.fateCoin.flip({ count, threshold, flipperUserId })
//   game.modules.get("gluniverse-destiny-dice").api.fateCoin.openDialog()
export function buildFateCoinApi() {
  return {
    flip: (options = {}) => beginCeremony(options),
    openDialog: () => openCoinDialog(),
  };
}
