import { MODULE_ID } from "./coin-constants.mjs";

// The persistent chat record (§Q10). One authoritative message, posted only by
// the initiating GM. Styled with the shared "Etched Glass" tokens, themed for
// Boon/Bane and carrying no system-specific data.

export function buildCoinCardHtml(data) {
  const { isBoon, verdictLabel, goodLabel, badLabel, boonCount, count, threshold, coins, flipperName } = data;

  const pips = coins
    .map((good) => {
      const cls = good ? "glfc-card-pip--good" : "glfc-card-pip--bad";
      const title = good ? goodLabel : badLabel;
      return `<span class="glfc-card-pip ${cls}" title="${escapeHtml(title)}"></span>`;
    })
    .join("");

  const tally = game.i18n.format("GLFC.Card.Tally", {
    boons: boonCount,
    count,
    threshold,
    label: goodLabel,
  });

  const flipLine = flipperName
    ? `<span class="glfc-card-flipper">${escapeHtml(game.i18n.format("GLFC.Card.FlippedBy", { name: flipperName }))}</span>`
    : "";

  return `<section class="glfc-card glfc-card--${isBoon ? "good" : "bad"} glfc-reveal" data-module="${MODULE_ID}">
    <i class="glfc-card-cut" aria-hidden="true"></i>
    <div class="glfc-card-face">${pips}</div>
    <div class="glfc-card-body">
      <span class="glfc-card-kicker">GLU·FATE COIN</span>
      <span class="glfc-card-name">${escapeHtml(verdictLabel)}</span>
      <span class="glfc-card-tally">${escapeHtml(tally)}</span>
      ${flipLine}
    </div>
  </section>`;
}

export async function postCoinResult(data) {
  const content = buildCoinCardHtml(data);
  await ChatMessage.create({
    content,
    speaker: { alias: game.i18n.localize("GLFC.Card.Speaker") },
    flags: { [MODULE_ID]: { fateCoin: { verdict: data.isBoon ? "good" : "bad", coins: data.coins } } },
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
