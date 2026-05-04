export const MODULE_ID = "gluniverse-destiny-dice";
export const MODULE_TITLE = "GLUniverse Destiny Dice";
export const FATE_DIE_DENOMINATION = "z";
export const FATE_DIE_NOTATION = `1d${FATE_DIE_DENOMINATION}`;

export const FLAGS = {
  fate: "fate",
  pendingFatedRoll: "pendingFatedRoll",
};

export const FACE_NUMBERS = [1, 2, 3, 4, 5, 6];

export const DEFAULT_FATE_FACES = {
  1: { kind: "tyranny", bonus: 4, image: `modules/${MODULE_ID}/assets/dice/tyranny-4.png` },
  2: { kind: "tyranny", bonus: 2, image: `modules/${MODULE_ID}/assets/dice/tyranny-2.png` },
  3: { kind: "blank", bonus: 0, image: "" },
  4: { kind: "blank", bonus: 0, image: "" },
  5: { kind: "defiance", bonus: 0, image: `modules/${MODULE_ID}/assets/dice/defiance.png` },
  6: { kind: "defiance", bonus: 2, image: `modules/${MODULE_ID}/assets/dice/defiance-2.png` },
};

export const FATE_FACES = DEFAULT_FATE_FACES;
