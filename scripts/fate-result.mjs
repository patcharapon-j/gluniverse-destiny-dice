import { FATE_DIE_DENOMINATION, FATE_DIE_NOTATION, FLAGS, KIND_OPPORTUNITY, MODULE_ID } from "./constants.mjs";
import { getFaceImagePaths, getFateFace, getKindLabel, normalizeKind } from "./settings.mjs";

const inFlightFateRolls = new Set();
const FATE_STRIP_PATTERN = /<(footer|section)\b[^>]*class="[^"]*glddf-fate-(?:strip|result)[^"]*"[^>]*>[\s\S]*?<\/\1>\s*/gi;

export function isPcCheckMessage(message) {
  const context = message?.flags?.pf2e?.context;
  const actor = message?.actor ?? message?.speakerActor;
  const firstRoll = message?.rolls?.at?.(0);
  const hasD20 = firstRoll?.dice?.some?.((die) => die.faces === 20) ?? message?.isCheckRoll ?? false;
  return !!context && hasD20 && !!actor?.isOfType?.("character");
}

export function canUserAddFate(message) {
  if (!isPcCheckMessage(message)) return false;
  if (message.getFlag(MODULE_ID, FLAGS.fate)) return false;
  const actor = message.actor ?? message.speakerActor;
  return game.user.isGM || message.isAuthor || !!actor?.isOwner;
}

export async function applyFateToMessage(message, { source = "manual" } = {}) {
  if (!message?.id || !canUserAddFate(message)) return null;
  if (inFlightFateRolls.has(message.id)) return null;
  inFlightFateRolls.add(message.id);
  try {
    const roll = await new Roll(FATE_DIE_NOTATION).evaluate({ allowInteractive: true });
    if (game.dice3d) await game.dice3d.showForRoll(roll, game.user, true);

    const face = getFaceResult(roll);
    if (!face) {
      console.error(`GLUniverse Destiny Dice | ${FATE_DIE_NOTATION} produced no readable face`, roll);
      ui.notifications?.error(`GLUniverse Destiny Dice | ${FATE_DIE_NOTATION} produced no readable face. See console for details.`);
      return null;
    }

    const fate = {
      source,
      face: face.value,
      kind: normalizeKind(face.kind),
      bonus: face.bonus,
      accepted: null,
      roll: roll.toJSON(),
      user: game.user.id,
      appliedAt: Date.now(),
    };

    const updates = { [`flags.${MODULE_ID}.${FLAGS.fate}`]: fate };
    const cleanedContent = (message.content ?? "").replace(FATE_STRIP_PATTERN, "");
    if (cleanedContent !== message.content) updates.content = cleanedContent;
    await message.update(updates);

    return fate;
  } finally {
    inFlightFateRolls.delete(message.id);
  }
}

export function registerFateRendering() {
  Hooks.on("renderChatMessageHTML", attachFateStrip);
}

function attachFateStrip(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0] ?? null;
  if (!root) return;
  const content = root.querySelector?.(".message-content");
  if (!content) return;

  content.querySelectorAll(".glddf-fate-strip, .glddf-fate-result").forEach((node) => node.remove());

  const fate = message?.flags?.[MODULE_ID]?.[FLAGS.fate];
  if (!fate) return;
  content.insertAdjacentHTML("beforeend", renderFateBar(fate));
}

function getFaceResult(roll) {
  const die = roll.dice.find((d) => d.faces === 6 && d.constructor?.DENOMINATION === FATE_DIE_DENOMINATION)
    ?? roll.dice.find((d) => d.faces === 6);
  const value = die?.results?.find((r) => r.active !== false && !r.discarded)?.result;
  if (!Number.isInteger(value)) return null;
  const face = getFateFace(value);
  return face ? { value, ...face } : null;
}

// A freshly-applied fate plays the reveal-contract ceremony (§6.3); re-renders
// of an older message (scroll, edit) render the strip in its settled state.
const FATE_REVEAL_WINDOW_MS = 4000;

function renderFateBar(fate) {
  const kind = normalizeKind(fate.kind);
  const kindLabel = getKindLabel(kind);
  const isFresh = Number.isFinite(fate.appliedAt) && Date.now() - fate.appliedAt < FATE_REVEAL_WINDOW_MS;
  const classes = [
    "glddf-fate-strip",
    `glddf-${kind}`,
    fate.accepted === false ? "glddf-refused" : "",
    isFresh && fate.accepted !== false ? "glddf-reveal" : "",
  ].filter(Boolean).join(" ");

  const showBonus = kind !== KIND_OPPORTUNITY && fate.bonus !== 0;
  const bonusLockup = showBonus
    ? `<div class="glddf-fate-bonus">
        <span class="glddf-fate-bonus-num">${formatSignedNumber(fate.bonus)}</span>
        <span class="glddf-fate-bonus-unit">MOD</span>
      </div>`
    : "";

  // Fake technical designator — pure provenance garnish (§4.2).
  const serial = `GLU·FATE · 0${fate.face}`;

  return `<footer class="${classes}" data-fate-face="${fate.face}">
    <i class="glddf-cut" aria-hidden="true"></i>
    <i class="glddf-bracket" aria-hidden="true"></i>
    ${renderGlyph(fate)}
    <div class="glddf-fate-body">
      <div class="glddf-fate-lines">
        <span class="glddf-fate-kicker">${serial}</span>
        <span class="glddf-fate-name">${kindLabel}</span>
      </div>
      ${bonusLockup}
    </div>
  </footer>`;
}

function renderGlyph(fate) {
  const paths = getFaceImagePaths(fate.face);
  if (paths?.image) {
    return `<img class="glddf-fate-face" src="${paths.image}" alt="" />`;
  }
  return `<span class="glddf-fate-glyph"><i class="fa-regular fa-circle-dot"></i></span>`;
}

function formatSignedNumber(value) {
  return value > 0 ? `+${value}` : String(value);
}
