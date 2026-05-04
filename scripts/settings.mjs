import { DEFAULT_FATE_FACES, FACE_NUMBERS, MODULE_ID } from "./constants.mjs";

export const SETTINGS = {
  tyrannyLabel: "tyrannyLabel",
  defianceLabel: "defianceLabel",
  blankLabel: "blankLabel",
  tyrannyColor: "tyrannyColor",
  defianceColor: "defianceColor",
  blankColor: "blankColor",
  face1Image: "face1Image",
  face2Image: "face2Image",
  face5Image: "face5Image",
  face6Image: "face6Image",
};

for (const face of FACE_NUMBERS) {
  SETTINGS[`face${face}Kind`] = `face${face}Kind`;
  SETTINGS[`face${face}Bonus`] = `face${face}Bonus`;
  SETTINGS[`face${face}Image`] ??= `face${face}Image`;
}

const FACE_TO_SETTING = {
  1: SETTINGS.face1Image,
  2: SETTINGS.face2Image,
  3: SETTINGS.face3Image,
  4: SETTINGS.face4Image,
  5: SETTINGS.face5Image,
  6: SETTINGS.face6Image,
};

const LEGACY_FACE_IMAGE_PATHS = {
  "tyranny-4": DEFAULT_FATE_FACES[1].image,
  "tyranny-2": DEFAULT_FATE_FACES[2].image,
  defiance: DEFAULT_FATE_FACES[5].image,
  "defiance-2": DEFAULT_FATE_FACES[6].image,
};

const FATE_KIND_CHOICES = {
  tyranny: "GLDDF.Fate.Kind.tyranny",
  defiance: "GLDDF.Fate.Kind.defiance",
  blank: "GLDDF.Fate.Kind.blank",
};

const KIND_TO_LABEL_SETTING = {
  tyranny: SETTINGS.tyrannyLabel,
  defiance: SETTINGS.defianceLabel,
  blank: SETTINGS.blankLabel,
};

const KIND_TO_COLOR_SETTING = {
  tyranny: SETTINGS.tyrannyColor,
  defiance: SETTINGS.defianceColor,
  blank: SETTINGS.blankColor,
};

const DEFAULT_COLORS = {
  tyranny: "#f5c455",
  defiance: "#ff5a4a",
  blank: "#dcdcdc",
};

const FACE_CONFIG_TEMPLATE = `modules/${MODULE_ID}/templates/face-config.hbs`;
const HEX_PATTERN = /^#?[0-9a-f]{6}$/i;

export function registerSettings() {
  const reg = (key, opts) => game.settings.register(MODULE_ID, key, {
    scope: "world",
    config: true,
    ...opts,
  });

  reg(SETTINGS.tyrannyLabel, {
    name: "GLDDF.Settings.TyrannyLabel.Name",
    hint: "GLDDF.Settings.TyrannyLabel.Hint",
    type: String,
    default: "Tyranny",
    onChange: applyThemeFromSettings,
  });
  reg(SETTINGS.defianceLabel, {
    name: "GLDDF.Settings.DefianceLabel.Name",
    hint: "GLDDF.Settings.DefianceLabel.Hint",
    type: String,
    default: "Defiance",
    onChange: applyThemeFromSettings,
  });
  reg(SETTINGS.blankLabel, {
    name: "GLDDF.Settings.BlankLabel.Name",
    hint: "GLDDF.Settings.BlankLabel.Hint",
    type: String,
    default: "Blank",
    onChange: applyThemeFromSettings,
  });

  reg(SETTINGS.tyrannyColor, {
    name: "GLDDF.Settings.TyrannyColor.Name",
    hint: "GLDDF.Settings.TyrannyColor.Hint",
    type: String,
    default: DEFAULT_COLORS.tyranny,
    onChange: applyThemeFromSettings,
  });
  reg(SETTINGS.defianceColor, {
    name: "GLDDF.Settings.DefianceColor.Name",
    hint: "GLDDF.Settings.DefianceColor.Hint",
    type: String,
    default: DEFAULT_COLORS.defiance,
    onChange: applyThemeFromSettings,
  });
  reg(SETTINGS.blankColor, {
    name: "GLDDF.Settings.BlankColor.Name",
    hint: "GLDDF.Settings.BlankColor.Hint",
    type: String,
    default: DEFAULT_COLORS.blank,
    onChange: applyThemeFromSettings,
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
    const defaults = DEFAULT_FATE_FACES[face];
    reg(getFaceKindSetting(face), {
      name: `Face ${face} Result`,
      hint: `Controls whether face ${face} counts as Tyranny, Defiance, or Blank.`,
      type: String,
      choices: FATE_KIND_CHOICES,
      default: defaults.kind,
      config: false,
    });
    reg(getFaceBonusSetting(face), {
      name: `Face ${face} Value`,
      hint: `Numeric value shown with face ${face}. Use 0 for no value.`,
      type: Number,
      default: defaults.bonus,
      config: false,
    });
    reg(getFaceImageSetting(face), {
      name: `Face ${face} PNG`,
      hint: `PNG image for face ${face}.`,
      type: String,
      default: defaults.image,
      filePicker: "image",
      requiresReload: true,
      config: false,
    });
  }
}

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

export async function migrateLegacySettings() {
  if (!game.user?.isGM) return;
  for (const face of FACE_NUMBERS) {
    const setting = getFaceImageSetting(face);
    const value = getSetting(setting);
    const migrated = normalizeImagePath(value);
    if (migrated && migrated !== value) await game.settings.set(MODULE_ID, setting, migrated);
  }
}

export function getKindLabel(kind) {
  const setting = KIND_TO_LABEL_SETTING[kind];
  if (!setting) return kind;
  const value = getSetting(setting);
  return typeof value === "string" && value.trim() ? value : kind;
}

export function getKindColor(kind) {
  const setting = KIND_TO_COLOR_SETTING[kind];
  return normalizeHex(setting ? getSetting(setting) : null, DEFAULT_COLORS[kind] ?? "#cccccc");
}

export function getFateFace(face) {
  if (!FACE_NUMBERS.includes(face)) return null;
  const defaults = DEFAULT_FATE_FACES[face];
  return {
    kind: getFaceKind(face, defaults.kind),
    bonus: getFaceBonus(face, defaults.bonus),
  };
}

export function getConfiguredFateFaces() {
  return Object.fromEntries(FACE_NUMBERS.map((face) => [face, getFateFace(face)]));
}

export function getFaceImagePath(face) {
  const setting = FACE_TO_SETTING[face];
  return normalizeImagePath(setting ? getSetting(setting) : null);
}

export function getFaceImagePaths(face) {
  const image = getFaceImagePath(face);
  if (!image) return null;
  const companion = getCompanionImagePaths(image);
  return {
    image,
    bump: companion?.bump ?? image,
    emissive: companion?.emissive ?? image,
  };
}

function getFaceKind(face, fallback) {
  const value = getSetting(getFaceKindSetting(face));
  return Object.prototype.hasOwnProperty.call(FATE_KIND_CHOICES, value) ? value : fallback;
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

function getCompanionImagePaths(image) {
  const builtInEntry = Object.values(LEGACY_FACE_IMAGE_PATHS).includes(image);
  if (!builtInEntry) return null;
  const root = image.replace(/\.png$/i, "");
  return {
    bump: `${root}-bump.png`,
    emissive: `${root}-emissive.png`,
  };
}

class DestinyFaceConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "glddf-face-config",
      title: game.i18n.localize("GLDDF.Settings.FaceConfig.Title"),
      template: FACE_CONFIG_TEMPLATE,
      width: 760,
      height: "auto",
      classes: ["glddf-face-config"],
      closeOnSubmit: true,
    });
  }

  getData() {
    const kinds = Object.entries(FATE_KIND_CHOICES).map(([value, label]) => ({
      value,
      label: game.i18n.localize(label),
    }));

    return {
      reloadHint: game.i18n.localize("GLDDF.Settings.FaceConfig.ReloadHint"),
      faces: FACE_NUMBERS.map((face) => {
        const fateFace = getFateFace(face);
        const image = getFaceImagePath(face);
        return {
          face,
          kind: fateFace.kind,
          bonus: fateFace.bonus,
          image,
          kinds: kinds.map((kind) => ({ ...kind, selected: kind.value === fateFace.kind })),
        };
      }),
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='browse-image']").on("click", (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      const face = button.dataset.face;
      const input = html.find(`input[name="face.${face}.image"]`)[0];
      const preview = html.find(`[data-preview-face="${face}"]`)[0];
      new FilePicker({
        type: "image",
        current: input?.value ?? "",
        callback: (path) => {
          if (input) input.value = path;
          if (preview) preview.src = path;
        },
      }).render(true);
    });
  }

  async _updateObject(_event, formData) {
    const expanded = foundry.utils.expandObject(formData);
    for (const face of FACE_NUMBERS) {
      const data = expanded.face?.[face] ?? {};
      await game.settings.set(MODULE_ID, getFaceKindSetting(face), data.kind ?? DEFAULT_FATE_FACES[face].kind);
      await game.settings.set(MODULE_ID, getFaceBonusSetting(face), Number(data.bonus) || 0);
      await game.settings.set(MODULE_ID, getFaceImageSetting(face), normalizeImagePath(data.image));
    }
    ui.notifications?.info(game.i18n.localize("GLDDF.Settings.FaceConfig.Saved"));
  }
}

function normalizeHex(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!HEX_PATTERN.test(trimmed)) return fallback;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export function applyThemeFromSettings() {
  if (typeof document === "undefined") return;
  const tyranny = getKindColor("tyranny");
  const defiance = getKindColor("defiance");
  const blank = getKindColor("blank");

  const css = [
    themeStripRule(".glddf-fate-strip.glddf-tyranny", tyranny),
    themeStripRule(".glddf-fate-strip.glddf-defiance", defiance),
    themeStripRule(".glddf-fate-strip.glddf-blank", blank),
    themeToggleRule(tyranny),
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
