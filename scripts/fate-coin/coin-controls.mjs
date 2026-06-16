import {
  COIN_COUNT_DEFAULT,
  COIN_COUNT_MAX,
  COIN_COUNT_MIN,
  COIN_THRESHOLD_DEFAULT,
} from "./coin-constants.mjs";
import { beginCeremony, isCeremonyActive } from "./coin-ceremony.mjs";

// GM-only entry point (§Q14): a button injected into the native Token control
// group, which opens the setup dialog. The macro API in coin-api.mjs is the
// secondary entry point.

export function registerCoinControls() {
  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
}

function onGetSceneControlButtons(controls) {
  if (!game.user?.isGM) return;

  const tool = {
    name: "fate-coin-flip",
    title: game.i18n.localize("GLFC.Control.Flip"),
    icon: "fa-solid fa-coins",
    button: true,
    visible: true,
    onClick: () => openCoinDialog(),
    onChange: () => openCoinDialog(),
  };

  // v13+ passes a Record keyed by control name; older cores pass an Array.
  const tokenGroup = findTokenGroup(controls);
  if (!tokenGroup) return;

  if (Array.isArray(tokenGroup.tools)) {
    if (!tokenGroup.tools.some((existing) => existing.name === tool.name)) tokenGroup.tools.push(tool);
  } else if (tokenGroup.tools && typeof tokenGroup.tools === "object") {
    tokenGroup.tools[tool.name] = tool;
  }
}

function findTokenGroup(controls) {
  const names = ["tokens", "token"];
  if (Array.isArray(controls)) {
    return controls.find((group) => names.includes(group?.name)) ?? null;
  }
  if (controls && typeof controls === "object") {
    for (const name of names) {
      if (controls[name]) return controls[name];
    }
  }
  return null;
}

export async function openCoinDialog() {
  if (!game.user.isGM) {
    ui.notifications?.warn(game.i18n.localize("GLFC.Notify.GMOnly"));
    return;
  }
  if (isCeremonyActive()) {
    ui.notifications?.warn(game.i18n.localize("GLFC.Notify.InProgress"));
    return;
  }

  const localize = (key) => game.i18n.localize(key);
  const online = game.users.filter((user) => user.active);
  const options = online
    .map((user) => {
      const label = `${user.name}${user.isGM ? " (GM)" : ""}`;
      return `<option value="${user.id}"${user.isSelf ? " selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");

  const content = `
    <div class="glfc-dialog">
      <p class="glfc-dialog-hint">${localize("GLFC.Dialog.Hint")}</p>
      <div class="glfc-dialog-row">
        <label for="glfc-count">${localize("GLFC.Dialog.Count")}</label>
        <input id="glfc-count" type="number" name="count" value="${COIN_COUNT_DEFAULT}"
               min="${COIN_COUNT_MIN}" max="${COIN_COUNT_MAX}" step="1" />
      </div>
      <div class="glfc-dialog-row">
        <label for="glfc-threshold">${localize("GLFC.Dialog.Threshold")}</label>
        <input id="glfc-threshold" type="number" name="threshold" value="${COIN_THRESHOLD_DEFAULT}"
               min="1" max="${COIN_COUNT_MAX}" step="1" />
      </div>
      <p class="glfc-dialog-note">${localize("GLFC.Dialog.ThresholdHint")}</p>
      <div class="glfc-dialog-row">
        <label for="glfc-flipper">${localize("GLFC.Dialog.Flipper")}</label>
        <select id="glfc-flipper" name="flipper">${options}</select>
      </div>
    </div>
  `;

  const DialogV2 = foundry.applications.api.DialogV2;
  const result = await DialogV2.wait({
    window: { title: localize("GLFC.Dialog.Title"), icon: "fa-solid fa-coins" },
    classes: ["glfc-dialog-window"],
    content,
    buttons: [
      {
        action: "flip",
        label: localize("GLFC.Dialog.Begin"),
        icon: "fa-solid fa-coins",
        default: true,
        callback: (_event, _button, dialog) => readDialog(dialog),
      },
      { action: "cancel", label: localize("GLFC.Dialog.Cancel"), icon: "fa-solid fa-xmark" },
    ],
    rejectClose: false,
  }).catch(() => null);

  if (!result || result === "cancel") return;
  await beginCeremony(result);
}

function readDialog(dialog) {
  const root = dialog?.element ?? dialog;
  const count = Number(root.querySelector('[name="count"]')?.value) || COIN_COUNT_DEFAULT;
  const threshold = Number(root.querySelector('[name="threshold"]')?.value) || COIN_THRESHOLD_DEFAULT;
  const flipperUserId = root.querySelector('[name="flipper"]')?.value ?? game.user.id;
  return { count, threshold, flipperUserId };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
