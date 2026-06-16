import { MODULE_ID } from "../constants.mjs";
import {
  COIN_LABEL_BAD_DEFAULT,
  COIN_LABEL_GOOD_DEFAULT,
  COIN_SETTINGS,
} from "./coin-constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const CONFIG_TEMPLATE = `modules/${MODULE_ID}/templates/coin-config.hbs`;

// Surfaces that take a full texture/bump/emission set.
const FACE_FIELDS = [
  {
    id: "good",
    labelKey: "GLFC.Config.GoodFace",
    texture: COIN_SETTINGS.goodTexture,
    bump: COIN_SETTINGS.goodBump,
    emissive: COIN_SETTINGS.goodEmissive,
  },
  {
    id: "bad",
    labelKey: "GLFC.Config.BadFace",
    texture: COIN_SETTINGS.badTexture,
    bump: COIN_SETTINGS.badBump,
    emissive: COIN_SETTINGS.badEmissive,
  },
];

const SOUND_FIELDS = [
  { id: COIN_SETTINGS.soundWindup, labelKey: "GLFC.Config.SoundWindup" },
  { id: COIN_SETTINGS.soundToss, labelKey: "GLFC.Config.SoundToss" },
  { id: COIN_SETTINGS.soundSettle, labelKey: "GLFC.Config.SoundSettle" },
  { id: COIN_SETTINGS.soundBoon, labelKey: "GLFC.Config.SoundBoon" },
  { id: COIN_SETTINGS.soundBane, labelKey: "GLFC.Config.SoundBane" },
];

export function registerCoinSettings() {
  const regString = (key, defaultValue, extra = {}) =>
    game.settings.register(MODULE_ID, key, {
      scope: "world",
      config: false,
      type: String,
      default: defaultValue,
      ...extra,
    });

  regString(COIN_SETTINGS.labelGood, COIN_LABEL_GOOD_DEFAULT);
  regString(COIN_SETTINGS.labelBad, COIN_LABEL_BAD_DEFAULT);

  for (const face of FACE_FIELDS) {
    regString(face.texture, "", { filePicker: "image" });
    regString(face.bump, "", { filePicker: "image" });
    regString(face.emissive, "", { filePicker: "image" });
  }
  regString(COIN_SETTINGS.edgeTexture, "", { filePicker: "image" });

  for (const sound of SOUND_FIELDS) {
    regString(sound.id, "", { filePicker: "audio" });
  }

  game.settings.registerMenu(MODULE_ID, "fateCoinConfig", {
    name: "GLFC.Config.Name",
    label: "GLFC.Config.Label",
    hint: "GLFC.Config.Hint",
    icon: "fa-solid fa-coins",
    type: DestinyCoinConfig,
    restricted: true,
  });
}

export function getCoinSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

function trimmed(key) {
  const value = getCoinSetting(key);
  return typeof value === "string" ? value.trim() : "";
}

export function getCoinLabels() {
  return {
    good: trimmed(COIN_SETTINGS.labelGood) || COIN_LABEL_GOOD_DEFAULT,
    bad: trimmed(COIN_SETTINGS.labelBad) || COIN_LABEL_BAD_DEFAULT,
  };
}

// The full material description handed to the cinematic. Empty strings mean
// "use the procedural default for this surface".
export function getCoinMaterials() {
  return {
    good: {
      texture: trimmed(COIN_SETTINGS.goodTexture),
      bump: trimmed(COIN_SETTINGS.goodBump),
      emissive: trimmed(COIN_SETTINGS.goodEmissive),
    },
    bad: {
      texture: trimmed(COIN_SETTINGS.badTexture),
      bump: trimmed(COIN_SETTINGS.badBump),
      emissive: trimmed(COIN_SETTINGS.badEmissive),
    },
    edge: { texture: trimmed(COIN_SETTINGS.edgeTexture) },
  };
}

export function getCoinSounds() {
  return {
    windup: trimmed(COIN_SETTINGS.soundWindup),
    toss: trimmed(COIN_SETTINGS.soundToss),
    settle: trimmed(COIN_SETTINGS.soundSettle),
    boon: trimmed(COIN_SETTINGS.soundBoon),
    bane: trimmed(COIN_SETTINGS.soundBane),
  };
}

// ---------------------------------------------------------------------------
// The configuration menu — mirrors the existing DestinyFaceConfig pattern.
// ---------------------------------------------------------------------------
class DestinyCoinConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "glfc-coin-config",
    tag: "form",
    classes: ["glfc-coin-config"],
    window: {
      title: "GLFC.Config.Title",
      icon: "fa-solid fa-coins",
      contentClasses: ["standard-form"],
    },
    position: { width: 640, height: "auto" },
    form: {
      handler: DestinyCoinConfig.#onSubmit,
      closeOnSubmit: true,
    },
    actions: {
      browse: DestinyCoinConfig.#onBrowse,
    },
  };

  static PARTS = {
    form: { template: CONFIG_TEMPLATE },
  };

  async _prepareContext() {
    const localize = (key) => game.i18n.localize(key);
    const labels = getCoinLabels();
    const materials = getCoinMaterials();

    const faces = FACE_FIELDS.map((face) => ({
      id: face.id,
      label: localize(face.labelKey),
      maps: [
        { name: face.texture, label: localize("GLFC.Config.Texture"), value: materials[face.id].texture },
        { name: face.bump, label: localize("GLFC.Config.Bump"), value: materials[face.id].bump },
        { name: face.emissive, label: localize("GLFC.Config.Emissive"), value: materials[face.id].emissive },
      ],
    }));

    return {
      reloadHint: localize("GLFC.Config.ReloadHint"),
      labelGoodName: COIN_SETTINGS.labelGood,
      labelBadName: COIN_SETTINGS.labelBad,
      labelGood: labels.good,
      labelBad: labels.bad,
      labelGoodFieldLabel: localize("GLFC.Config.GoodLabel"),
      labelBadFieldLabel: localize("GLFC.Config.BadLabel"),
      faces,
      edge: {
        label: localize("GLFC.Config.EdgeFace"),
        name: COIN_SETTINGS.edgeTexture,
        textureLabel: localize("GLFC.Config.Texture"),
        value: materials.edge.texture,
      },
      sounds: SOUND_FIELDS.map((sound) => ({
        name: sound.id,
        label: localize(sound.labelKey),
        value: trimmed(sound.id),
      })),
      browseLabel: localize("GLFC.Config.Browse"),
    };
  }

  static async #onBrowse(_event, target) {
    const field = target.dataset.field;
    const pickerType = target.dataset.pickerType || "image";
    const input = this.element.querySelector(`[name="${field}"]`);
    const FilePickerImpl = foundry.applications.apps.FilePicker?.implementation ?? globalThis.FilePicker;
    new FilePickerImpl({
      type: pickerType,
      current: input?.value ?? "",
      callback: (path) => {
        if (input) input.value = path;
      },
    }).render(true);
  }

  static async #onSubmit(_event, _form, formData) {
    const data = formData.object;
    for (const [key, value] of Object.entries(data)) {
      // Only persist keys we own; ApplicationV2 form data is flat by name.
      await game.settings.set(MODULE_ID, key, typeof value === "string" ? value.trim() : value);
    }
    ui.notifications?.info(game.i18n.localize("GLFC.Config.Saved"));
  }
}
