import { COIN_MSG, COIN_SOCKET } from "./coin-constants.mjs";
import { handleDismiss, handleStart, handleToss } from "./coin-ceremony.mjs";

// Thin wrapper over Foundry's core socket. Every client receives every coin
// message; handlers decide what to do based on role (flipper / GM / spectator).

export function registerCoinSocket() {
  game.socket.on(COIN_SOCKET, onCoinMessage);
}

export function emitCoin(type, payload) {
  game.socket.emit(COIN_SOCKET, { t: type, ...payload });
}

function onCoinMessage(message) {
  if (!message || typeof message.t !== "string") return;
  try {
    switch (message.t) {
      case COIN_MSG.start:
        handleStart(message);
        break;
      case COIN_MSG.toss:
        handleToss(message);
        break;
      case COIN_MSG.dismiss:
        handleDismiss(message);
        break;
      default:
        break;
    }
  } catch (error) {
    console.error("GLUniverse Fate Coin | socket handler failed", error);
  }
}
