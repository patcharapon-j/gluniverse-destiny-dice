export const MODULE_ID = "gluniverse-destiny-dice";
export const MODULE_TITLE = "GLUniverse Destiny Dice";
export const FATE_DIE_DENOMINATION = "z";
export const FATE_DIE_NOTATION = `1d${FATE_DIE_DENOMINATION}`;

export const FLAGS = {
  fate: "fate",
  pendingFatedRoll: "pendingFatedRoll",
};

export const FACE_NUMBERS = [1, 2, 3, 4, 5, 6];

export const KIND_OPPORTUNITY = "opportunity";
export const KIND_COMPLICATION = "complication";
export const KIND_BLANK = "blank";

export const FATE_KINDS = [KIND_OPPORTUNITY, KIND_COMPLICATION, KIND_BLANK];

// Map legacy stored kind values to their new canonical names.
export const KIND_ALIASES = {
  tyranny: KIND_COMPLICATION,
  defiance: KIND_OPPORTUNITY,
};

export const PRESET_DEFAULT = "default";
export const PRESET_AEGIS_FALLEN = "aegis-fallen";
export const PRESET_TIDES_OF_DESTINY = "tides-of-destiny";

const ASSET_ROOT = `modules/${MODULE_ID}/assets/dice`;

function faceAsset(folder, base) {
  if (!base) return { image: "", bump: "", emissive: "" };
  const root = folder ? `${ASSET_ROOT}/${folder}` : ASSET_ROOT;
  return {
    image: `${root}/${base}.png`,
    bump: `${root}/${base}-bump.png`,
    emissive: `${root}/${base}-emissive.png`,
  };
}

// Each preset supplies the face definitions (kind + bonus) and the textures
// for that preset. The internal kind identifiers stay the same across presets;
// only presentation (labels/colors/art) differs.
//
// Opportunity faces carry no numeric bonus — only Complication faces do.
export const PRESET_FATE_FACES = {
  [PRESET_DEFAULT]: {
    1: { kind: KIND_COMPLICATION, bonus: 4, ...faceAsset("", "tyranny-4") },
    2: { kind: KIND_COMPLICATION, bonus: 2, ...faceAsset("", "tyranny-2") },
    3: { kind: KIND_BLANK, bonus: 0, image: "", bump: "", emissive: "" },
    4: { kind: KIND_BLANK, bonus: 0, image: "", bump: "", emissive: "" },
    5: { kind: KIND_OPPORTUNITY, bonus: 0, ...faceAsset("", "defiance") },
    6: { kind: KIND_OPPORTUNITY, bonus: 0, ...faceAsset("", "defiance") },
  },
  [PRESET_AEGIS_FALLEN]: {
    1: { kind: KIND_COMPLICATION, bonus: 4, ...faceAsset("aegis-fallen", "tyranny-4") },
    2: { kind: KIND_COMPLICATION, bonus: 2, ...faceAsset("aegis-fallen", "tyranny-2") },
    3: { kind: KIND_BLANK, bonus: 0, ...faceAsset("aegis-fallen", "blank") },
    4: { kind: KIND_BLANK, bonus: 0, ...faceAsset("aegis-fallen", "blank") },
    5: { kind: KIND_OPPORTUNITY, bonus: 0, ...faceAsset("aegis-fallen", "defiance") },
    6: { kind: KIND_OPPORTUNITY, bonus: 0, ...faceAsset("aegis-fallen", "defiance") },
  },
  [PRESET_TIDES_OF_DESTINY]: {
    1: { kind: KIND_COMPLICATION, bonus: 4, ...faceAsset("tides-of-destiny", "storm-4") },
    2: { kind: KIND_COMPLICATION, bonus: 2, ...faceAsset("tides-of-destiny", "storm-2") },
    3: { kind: KIND_BLANK, bonus: 0, ...faceAsset("tides-of-destiny", "blank") },
    4: { kind: KIND_BLANK, bonus: 0, ...faceAsset("tides-of-destiny", "blank") },
    5: { kind: KIND_OPPORTUNITY, bonus: 0, ...faceAsset("tides-of-destiny", "tide") },
    6: { kind: KIND_OPPORTUNITY, bonus: 0, ...faceAsset("tides-of-destiny", "tide") },
  },
};

// Back-compat alias — older code imported DEFAULT_FATE_FACES.
export const DEFAULT_FATE_FACES = PRESET_FATE_FACES[PRESET_DEFAULT];
export const FATE_FACES = DEFAULT_FATE_FACES;

export const FATE_PRESETS = {
  [PRESET_DEFAULT]: {
    labels: {
      [KIND_OPPORTUNITY]: "Opportunity",
      [KIND_COMPLICATION]: "Complication",
      [KIND_BLANK]: "Blank",
    },
    colors: {
      [KIND_OPPORTUNITY]: "#ff5a4a",
      [KIND_COMPLICATION]: "#f5c455",
      [KIND_BLANK]: "#dcdcdc",
    },
    dsn: {
      colorsetName: `${MODULE_ID}-default`,
      colorsetDescription: "Destiny Fate Die",
      material: "metal",
      texture: "metal",
    },
  },
  [PRESET_AEGIS_FALLEN]: {
    labels: {
      [KIND_OPPORTUNITY]: "Defiance",
      [KIND_COMPLICATION]: "Tyranny",
      [KIND_BLANK]: "Blank",
    },
    colors: {
      [KIND_OPPORTUNITY]: "#ff5a4a",
      [KIND_COMPLICATION]: "#f5c455",
      [KIND_BLANK]: "#dcdcdc",
    },
    dsn: {
      colorsetName: `${MODULE_ID}-aegis-fallen`,
      colorsetDescription: "Aegis Fallen Fate Die",
      material: "metal",
      texture: "metal",
    },
  },
  [PRESET_TIDES_OF_DESTINY]: {
    labels: {
      [KIND_OPPORTUNITY]: "Tide",
      [KIND_COMPLICATION]: "Storm",
      [KIND_BLANK]: "Blank",
    },
    colors: {
      [KIND_OPPORTUNITY]: "#3ed8e8",
      [KIND_COMPLICATION]: "#a16bff",
      [KIND_BLANK]: "#dcdcdc",
    },
    dsn: {
      colorsetName: `${MODULE_ID}-tides-of-destiny`,
      colorsetDescription: "Tides of Destiny Fate Die",
      material: "metal",
      texture: "metal",
    },
  },
};
