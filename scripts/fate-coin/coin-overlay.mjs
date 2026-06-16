// The full-screen DOM overlay + HUD that frames the cinematic. The Babylon
// canvas (or the degraded static panel) lives inside `.glfc-stage`; the HUD
// (status line, flip/force/continue buttons, verdict banner) is plain DOM so
// it works identically whether or not WebGL is available.

export class CoinOverlay {
  constructor() {
    this.root = null;
    this.canvas = null;
    this.stage = null;
    this.statusEl = null;
    this.controlsEl = null;
    this.verdictEl = null;
  }

  mount() {
    this.destroy();

    const root = document.createElement("div");
    root.className = "glfc-overlay glfc-phase-summon";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.innerHTML = `
      <div class="glfc-vignette" aria-hidden="true"></div>
      <div class="glfc-stage">
        <canvas class="glfc-canvas"></canvas>
        <div class="glfc-static" hidden></div>
      </div>
      <div class="glfc-verdict" aria-live="polite"></div>
      <div class="glfc-hud">
        <p class="glfc-status" aria-live="polite"></p>
        <div class="glfc-controls"></div>
      </div>
    `;

    document.body.appendChild(root);

    this.root = root;
    this.canvas = root.querySelector(".glfc-canvas");
    this.stage = root.querySelector(".glfc-stage");
    this.staticEl = root.querySelector(".glfc-static");
    this.statusEl = root.querySelector(".glfc-status");
    this.controlsEl = root.querySelector(".glfc-controls");
    this.verdictEl = root.querySelector(".glfc-verdict");

    // Force a reflow then drop the summon class to trigger the fade-in.
    void root.offsetWidth;
    root.classList.add("glfc-visible");

    return { root, canvas: this.canvas, stage: this.stage, staticEl: this.staticEl };
  }

  setPhase(phase) {
    if (!this.root) return;
    this.root.classList.remove("glfc-phase-summon", "glfc-phase-flip", "glfc-phase-result");
    this.root.classList.add(`glfc-phase-${phase}`);
  }

  setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text ?? "";
  }

  clearControls() {
    if (this.controlsEl) this.controlsEl.replaceChildren();
  }

  #addButton(label, className, onClick, { icon } = {}) {
    if (!this.controlsEl) return null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `glfc-button ${className}`;
    button.innerHTML = `${icon ? `<i class="${icon}"></i>` : ""}<span>${escapeHtml(label)}</span>`;
    button.addEventListener("click", () => onClick(button));
    this.controlsEl.appendChild(button);
    return button;
  }

  showFlipButton(label, onFlip) {
    this.#addButton(label, "glfc-button--flip", (button) => {
      button.disabled = true;
      onFlip();
    }, { icon: "fa-solid fa-hand-sparkles" });
  }

  showForceButton(label, onForce) {
    this.#addButton(label, "glfc-button--force", (button) => {
      button.disabled = true;
      onForce();
    }, { icon: "fa-solid fa-gavel" });
  }

  showContinueButton(label, onContinue) {
    this.clearControls();
    this.#addButton(label, "glfc-button--continue", (button) => {
      button.disabled = true;
      onContinue();
    }, { icon: "fa-solid fa-forward" });
  }

  showVerdict({ verdictLabel, isBoon, tally, coins, goodLabel, badLabel }) {
    if (!this.verdictEl) return;
    this.setPhase("result");

    const pips = coins
      .map((good) => {
        const cls = good ? "glfc-pip--good" : "glfc-pip--bad";
        const title = good ? goodLabel : badLabel;
        return `<span class="glfc-pip ${cls}" title="${escapeHtml(title)}"></span>`;
      })
      .join("");

    this.verdictEl.className = `glfc-verdict glfc-verdict--${isBoon ? "good" : "bad"} glfc-reveal`;
    this.verdictEl.innerHTML = `
      <span class="glfc-verdict-kicker">GLU·FATE COIN</span>
      <span class="glfc-verdict-name">${escapeHtml(verdictLabel)}</span>
      <span class="glfc-verdict-tally">${escapeHtml(tally)}</span>
      <span class="glfc-verdict-pips">${pips}</span>
    `;
  }

  destroy() {
    if (this.root?.isConnected) this.root.remove();
    this.root = null;
    this.canvas = null;
    this.stage = null;
    this.staticEl = null;
    this.statusEl = null;
    this.controlsEl = null;
    this.verdictEl = null;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
