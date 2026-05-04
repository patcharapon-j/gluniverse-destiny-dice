import { FACE_NUMBERS, FATE_DIE_DENOMINATION, MODULE_ID } from "./constants.mjs";
import { getFaceImagePaths } from "./settings.mjs";

export function registerDiceSoNice(dice3d) {
  dice3d.addColorset({
    name: "gluniverse-destiny-fate",
    description: "Aegis Fallen Fate Die",
    category: "GLUniverse",
    foreground: "#f8f3de",
    background: "#171923",
    outline: "#02040a",
    edge: "#7b6b35",
    material: "metal",
    texture: "metal",
    font: "Signika",
  });

  dice3d.addSystem({ id: MODULE_ID, name: "GLUniverse Destiny Dice" }, "preferred");

  const faces = FACE_NUMBERS.map((face) => getFaceImagePaths(face));

  dice3d.addDicePreset({
    type: `d${FATE_DIE_DENOMINATION}`,
    labels: faces.map((paths) => paths?.image ?? ""),
    bumpMaps: faces.map((paths) => paths?.bump ?? ""),
    emissiveMaps: faces.map((paths) => paths?.emissive ?? ""),
    emissive: 0xffffff,
    emissiveIntensity: 0.45,
    colorset: "gluniverse-destiny-fate",
    system: MODULE_ID,
  });

  console.log(`GLUniverse Destiny Dice | Dice So Nice preset registered (1d${FATE_DIE_DENOMINATION})`);
}
