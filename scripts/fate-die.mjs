import { FATE_DIE_DENOMINATION, FATE_DIE_NOTATION } from "./constants.mjs";
import { getFateFace, getKindLabel } from "./settings.mjs";

export class DestinyFateDie extends foundry.dice.terms.Die {
  constructor(termData = {}) {
    super({ ...termData, faces: 6 });
  }

  static DENOMINATION = FATE_DIE_DENOMINATION;

  getResultLabel(result) {
    const face = getFateFace(result.result);
    if (!face) return String(result.result);
    const kindLabel = getKindLabel(face.kind);
    return face.bonus !== 0 ? `${kindLabel} ${formatSignedNumber(face.bonus)}` : kindLabel;
  }
}

export function registerFateDie() {
  CONFIG.Dice.terms[FATE_DIE_DENOMINATION] = DestinyFateDie;
  console.log(`GLUniverse Destiny Dice | Registered ${FATE_DIE_NOTATION}`);
}

function formatSignedNumber(value) {
  return value > 0 ? `+${value}` : String(value);
}
