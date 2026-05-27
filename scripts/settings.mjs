import {
  FACE_NUMBERS,
  FATE_KINDS,
  FATE_PRESETS,
  KIND_ALIASES,
  KIND_BLANK,
  KIND_OPPORTUNITY,
  MODULE_ID,
  PRESET_AEGIS_FALLEN,
  PRESET_DEFAULT,
  PRESET_FATE_FACES,
  PRESET_TIDES_OF_DESTINY,
} from "./constants.mjs";

export const SETTINGS = {
  preset: "preset",
  emissiveIntensity: "emissiveIntensity",
};

export const EMISSIVE_INTENSITY_DEFAULT = 1.0;
export const EMISSIVE_INTENSITY_MIN = 0;
export const EMISSIVE_INTENSITY_MAX = 2;
export const EMISSIVE_INTENSITY_STEP = 0.05;

for (const face of FACE_NUMBERS) {
  SETTINGS[`face${face}Kind`] = `face${face}Kind`;
  SETTINGS[`face${face}Bonus`] = `face${face}Bonus`;
  SETTINGS[`face${face}Image`] = `face${face}Image`;
}

// Map old loose filenames the previous version stored to a current asset path.
const LEGACY_FACE_IMAGE_PATHS = {
  "tyranny-4": PRESET_FATE_FACES[PRESET_DEFAULT][1].image,
  "tyranny-2": PRESET_FATE_FACES[PRESET_DEFAULT][2].image,
  defiance: PRESET_FATE_FACES[PRESET_DEFAULT][5].image,
  "defiance-2": PRESET_FATE_FACES[PRESET_DEFAULT][5].image,
};

// Set of paths that are "built-in" defaults for any preset — used to decide
// whether a stored image setting is a customization or just an old default.
const BUILTIN_IMAGE_PATHS = new Set();
for (const preset of Object.values(PRESET_FATE_FACES)) {
  for (const face of Object.values(preset)) {
    if (face.image) BUILTIN_IMAGE_PATHS.add(face.image);
  }
}
// Historical default paths that no longer exist as current preset defaults but
// were shipped by earlier module versions; migration treats them the same as
// current built-ins (clear → follow active preset).
for (const legacy of ["defiance.png", "defiance-2.png", "tyranny-2.png", "tyranny-4.png"]) {
  BUILTIN_IMAGE_PATHS.add(`modules/${MODULE_ID}/assets/dice/${legacy}`);
}

const PRESET_CHOICES = {
  [PRESET_DEFAULT]: "GLDDF.Settings.Preset.Default",
  [PRESET_AEGIS_FALLEN]: "GLDDF.Settings.Preset.AegisFallen",
  [PRESET_TIDES_OF_DESTINY]: "GLDDF.Settings.Preset.TidesOfDestiny",
};

const FATE_KIND_CHOICES = {
  opportunity: "GLDDF.Fate.Kind.opportunity",
  complication: "GLDDF.Fate.Kind.complication",
  blank: "GLDDF.Fate.Kind.blank",
};

const FACE_CONFIG_TEMPLATE = `modules/${MODULE_ID}/templates/face-config.hbs`;

export function registerSettings() {
  const reg = (key, opts) => game.settings.register(MODULE_ID, key, {
    scope: "world",
    config: true,
    ...opts,
  });

  reg(SETTINGS.preset, {
    name: "GLDDF.Settings.Preset.Name",
    hint: "GLDDF.Settings.Preset.Hint",
    type: String,
    choices: PRESET_CHOICES,
    default: PRESET_DEFAULT,
    requiresReload: true,
    onChange: applyThemeFromSettings,
  });

  reg(SETTINGS.emissiveIntensity, {
    name: "GLDDF.Settings.EmissiveIntensity.Name",
    hint: "GLDDF.Settings.EmissiveIntensity.Hint",
    type: Number,
    range: {
      min: EMISSIVE_INTENSITY_MIN,
      max: EMISSIVE_INTENSITY_MAX,
      step: EMISSIVE_INTENSITY_STEP,
    },
    default: EMISSIVE_INTENSITY_DEFAULT,
    requiresReload: true,
  });

  game.settings.registerMenu(MODULE_ID, "faceConfig", {
    name: "GLDDF.Settings.FaceConfig.Name",
    label: "GLDDF.Settings.FaceConfig.Label",
    hint: "GLDDF.Settings.FaceConfig.Hint",
    icon: "fa-solid fa-dice-d6",
    type: DestinyFaceConfig,
    restricted: true,
  });

  for (const face of FACE_NUMBERS) {
    const defaults = PRESET_FATE_FACES[PRESET_DEFAULT][face];
    reg(getFaceKindSetting(face), {
      type: String,
      choices: FATE_KIND_CHOICES,
      default: defaults.kind,
      config: false,
    });
    reg(getFaceBonusSetting(face), {
      type: Number,
      default: defaults.bonus,
      config: false,
    });
    reg(getFaceImageSetting(face), {
      type: String,
      default: "",
      filePicker: "image",
      requiresReload: true,
      config: false,
    });
  }
}

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

export function normalizeKind(kind) {
  if (typeof kind !== "string") return KIND_BLANK;
  const aliased = KIND_ALIASES[kind] ?? kind;
  return FATE_KINDS.includes(aliased) ? aliased : KIND_BLANK;
}

export function getActivePresetId() {
  const value = getSetting(SETTINGS.preset);
  return FATE_PRESETS[value] ? value : PRESET_DEFAULT;
}

export function getEmissiveIntensity() {
  const raw = Number(getSetting(SETTINGS.emissiveIntensity));
  if (!Number.isFinite(raw)) return EMISSIVE_INTENSITY_DEFAULT;
  return Math.min(EMISSIVE_INTENSITY_MAX, Math.max(EMISSIVE_INTENSITY_MIN, raw));
}

export function getActivePreset() {
  return FATE_PRESETS[getActivePresetId()];
}

function getPresetFace(face) {
  const presetId = getActivePresetId();
  return PRESET_FATE_FACES[presetId]?.[face] ?? PRESET_FATE_FACES[PRESET_DEFAULT][face];
}

export async function migrateLegacySettings() {
  if (!game.user?.isGM) return;
  for (const face of FACE_NUMBERS) {
    const imageSetting = getFaceImageSetting(face);
    const rawImage = getSetting(imageSetting);
    const migratedImage = normalizeImagePath(rawImage);

    // Clear stored image if it matches any built-in preset default — the
    // resolved path now comes from the active preset.
    if (migratedImage && BUILTIN_IMAGE_PATHS.has(migratedImage)) {
      if (rawImage !== "") await game.settings.set(MODULE_ID, imageSetting, "");
    } else if (migratedImage !== rawImage) {
      await game.settings.set(MODULE_ID, imageSetting, migratedImage);
    }

    const kindSetting = getFaceKindSetting(face);
    const kindValue = getSetting(kindSetting);
    const migratedKind = KIND_ALIASES[kindValue];
    if (migratedKind && migratedKind !== kindValue) {
      await game.settings.set(MODULE_ID, kindSetting, migratedKind);
    }

    // Opportunity faces no longer carry numeric bonuses.
    const resolvedKind = normalizeKind(getSetting(kindSetting));
    if (resolvedKind === KIND_OPPORTUNITY) {
      const bonusSetting = getFaceBonusSetting(face);
      if (Number(getSetting(bonusSetting)) !== 0) {
        await game.settings.set(MODULE_ID, bonusSetting, 0);
      }
    }
  }
}

export function getKindLabel(kind) {
  const normalized = normalizeKind(kind);
  return getActivePreset().labels[normalized] ?? normalized;
}

export function getKindColor(kind) {
  const normalized = normalizeKind(kind);
  return getActivePreset().colors[normalized] ?? "#cccccc";
}

export function getFateFace(face) {
  if (!FACE_NUMBERS.includes(face)) return null;
  const defaults = getPresetFace(face);
  const kind = getFaceKind(face, defaults.kind);
  const bonus = kind === KIND_OPPORTUNITY ? 0 : getFaceBonus(face, defaults.bonus);
  return { kind, bonus };
}

export function getConfiguredFateFaces() {
  return Object.fromEntries(FACE_NUMBERS.map((face) => [face, getFateFace(face)]));
}

export function getFaceImagePath(face) {
  const stored = normalizeImagePath(getSetting(getFaceImageSetting(face)));
  if (stored) return stored;
  return getPresetFace(face)?.image ?? "";
}

export function getFaceImagePaths(face) {
  const stored = normalizeImagePath(getSetting(getFaceImageSetting(face)));
  if (stored) {
    const builtIn = findBuiltInFace(stored);
    if (builtIn) return { image: builtIn.image, bump: builtIn.bump, emissive: builtIn.emissive };
    const root = stored.replace(/\.png$/i, "");
    return { image: stored, bump: `${root}-bump.png`, emissive: `${root}-emissive.png` };
  }
  const presetFace = getPresetFace(face);
  if (!presetFace?.image) return null;
  return {
    image: presetFace.image,
    bump: presetFace.bump || presetFace.image,
    emissive: presetFace.emissive || presetFace.image,
  };
}

function findBuiltInFace(image) {
  for (const preset of Object.values(PRESET_FATE_FACES)) {
    for (const face of Object.values(preset)) {
      if (face.image === image) return face;
    }
  }
  return null;
}

function getFaceKind(face, fallback) {
  return normalizeKind(getSetting(getFaceKindSetting(face))) || fallback;
}

function getFaceBonus(face, fallback) {
  const value = Number(getSetting(getFaceBonusSetting(face)));
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function getFaceKindSetting(face) {
  return SETTINGS[`face${face}Kind`];
}

function getFaceBonusSetting(face) {
  return SETTINGS[`face${face}Bonus`];
}

function getFaceImageSetting(face) {
  return SETTINGS[`face${face}Image`];
}

function normalizeImagePath(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return LEGACY_FACE_IMAGE_PATHS[trimmed] ?? trimmed;
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class DestinyFaceConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "glddf-face-config",
    tag: "form",
    classes: ["glddf-face-config"],
    window: {
      title: "GLDDF.Settings.FaceConfig.Title",
      icon: "fa-solid fa-dice-d6",
      contentClasses: ["standard-form"],
    },
    position: { width: 760, height: "auto" },
    form: {
      handler: DestinyFaceConfig.#onSubmit,
      closeOnSubmit: true,
    },
    actions: {
      browseImage: DestinyFaceConfig.#onBrowseImage,
    },
  };

  static PARTS = {
    form: { template: FACE_CONFIG_TEMPLATE },
  };

  async _prepareContext() {
    const kinds = Object.entries(FATE_KIND_CHOICES).map(([value, label]) => ({
      value,
      label: game.i18n.localize(label),
    }));

    return {
      reloadHint: game.i18n.localize("GLDDF.Settings.FaceConfig.ReloadHint"),
      faces: FACE_NUMBERS.map((face) => {
        const fateFace = getFateFace(face);
        const storedImage = normalizeImagePath(getSetting(getFaceImageSetting(face)));
        const resolvedImage = getFaceImagePath(face);
        const isOpportunity = fateFace.kind === KIND_OPPORTUNITY;
        return {
          face,
          kind: fateFace.kind,
          bonus: fateFace.bonus,
          bonusReadOnly: isOpportunity,
          image: storedImage,
          previewImage: resolvedImage,
          imagePlaceholder: getPresetFace(face)?.image ?? "",
          kinds: kinds.map((kind) => ({ ...kind, selected: kind.value === fateFace.kind })),
        };
      }),
    };
  }

  static async #onBrowseImage(_event, target) {
    const face = target.dataset.face;
    const input = this.element.querySelector(`input[name="face.${face}.image"]`);
    const preview = this.element.querySelector(`[data-preview-face="${face}"]`);
    const FilePickerImpl = foundry.applications.apps.FilePicker?.implementation ?? globalThis.FilePicker;
    new FilePickerImpl({
      type: "image",
      current: input?.value ?? "",
      callback: (path) => {
        if (input) input.value = path;
        if (preview) preview.src = path;
      },
    }).render(true);
  }

  static async #onSubmit(_event, _form, formData) {
    const expanded = foundry.utils.expandObject(formData.object);
    for (const face of FACE_NUMBERS) {
      const data = expanded.face?.[face] ?? {};
      const defaults = PRESET_FATE_FACES[PRESET_DEFAULT][face];
      const kind = normalizeKind(data.kind) || defaults.kind;
      const bonus = kind === KIND_OPPORTUNITY ? 0 : (Number(data.bonus) || 0);
      await game.settings.set(MODULE_ID, getFaceKindSetting(face), kind);
      await game.settings.set(MODULE_ID, getFaceBonusSetting(face), bonus);
      await game.settings.set(MODULE_ID, getFaceImageSetting(face), normalizeImagePath(data.image));
    }
    ui.notifications?.info(game.i18n.localize("GLDDF.Settings.FaceConfig.Saved"));
  }
}

export function applyThemeFromSettings() {
  if (typeof document === "undefined") return;
  const opportunity = getKindColor("opportunity");
  const complication = getKindColor("complication");
  const blank = getKindColor("blank");

  const css = [
    themeStripRule(".glddf-fate-strip.glddf-opportunity", opportunity),
    themeStripRule(".glddf-fate-strip.glddf-complication", complication),
    themeStripRule(".glddf-fate-strip.glddf-blank", blank),
    themeToggleRule(complication),
  ].join("\n");

  let style = document.getElementById("glddf-theme-overrides");
  if (!style) {
    style = document.createElement("style");
    style.id = "glddf-theme-overrides";
    document.head.appendChild(style);
  }
  style.textContent = css;
}

function themeStripRule(selector, color) {
  return `
${selector} {
  --glddf-rail: ${color};
  --glddf-rail-glow: color-mix(in oklab, ${color} 50%, transparent);
  --glddf-tint: color-mix(in oklab, ${color} 22%, transparent);
  --glddf-edge: color-mix(in oklab, ${color} 38%, transparent);
  background:
    linear-gradient(180deg, color-mix(in oklab, ${color} 12%, transparent), transparent 28%),
    radial-gradient(ellipse at 0% 50%, color-mix(in oklab, ${color} 24%, transparent), transparent 60%),
    linear-gradient(135deg, color-mix(in oklab, ${color} 12%, #0d0e15) 0%, color-mix(in oklab, ${color} 6%, #0a0b12) 55%, #06070b 100%);
  color: color-mix(in oklab, ${color} 38%, #f7efd6);
}`;
}

function themeToggleRule(color) {
  return `
.glddf-fated-roll-toggle {
  border-color: color-mix(in oklab, ${color} 38%, transparent);
  color: color-mix(in oklab, ${color} 35%, #fff5d5);
  background:
    linear-gradient(180deg, color-mix(in oklab, ${color} 14%, transparent), transparent 28%),
    radial-gradient(ellipse at 0% 50%, color-mix(in oklab, ${color} 24%, transparent), transparent 60%),
    linear-gradient(135deg, color-mix(in oklab, ${color} 14%, #1d180a) 0%, color-mix(in oklab, ${color} 7%, #15110a) 55%, #100c08 100%);
}
.glddf-fated-roll-toggle::before {
  background: ${color};
  box-shadow:
    0 0 6px ${color},
    0 0 14px color-mix(in oklab, ${color} 50%, transparent);
}
.glddf-fated-roll-toggle:hover {
  border-color: color-mix(in oklab, ${color} 56%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.09),
    inset 0 -1px 0 rgba(0, 0, 0, 0.45),
    0 0 12px color-mix(in oklab, ${color} 22%, transparent),
    0 1px 3px rgba(0, 0, 0, 0.5),
    0 6px 14px rgba(0, 0, 0, 0.4);
}
.glddf-fated-roll-toggle:has(input:checked) {
  border-color: color-mix(in oklab, ${color} 72%, transparent);
  color: color-mix(in oklab, ${color} 50%, #fff5d5);
  box-shadow:
    inset 0 0 14px color-mix(in oklab, ${color} 22%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 0 16px color-mix(in oklab, ${color} 38%, transparent),
    0 1px 3px rgba(0, 0, 0, 0.5),
    0 6px 14px rgba(0, 0, 0, 0.4);
}
.glddf-fated-roll-toggle > span {
  text-shadow:
    0 0 6px color-mix(in oklab, ${color} 28%, transparent),
    0 1px 0 rgba(0, 0, 0, 0.5);
}
.glddf-fated-roll-toggle input { accent-color: ${color}; }`;
}
