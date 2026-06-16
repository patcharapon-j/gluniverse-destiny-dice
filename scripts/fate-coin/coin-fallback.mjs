// Degraded, per-client presentation (§Q12) for reduced-motion clients, clients
// without WebGL, or when Babylon fails to load. The authoritative result is
// identical to the cinematic — only the staging is simplified to a quick,
// dependency-free CSS reveal.

export class CoinStaticView {
  constructor(staticEl, payload) {
    this.el = staticEl;
    this.payload = payload;
    this.coinEls = [];
  }

  async init() {
    if (!this.el) return;
    this.el.hidden = false;
    const labels = this.payload.labels ?? { good: "Boon", bad: "Bane" };
    this.el.innerHTML = `<div class="glfc-static-row"></div>`;
    const row = this.el.querySelector(".glfc-static-row");

    this.coinEls = this.payload.coins.map(() => {
      const coin = document.createElement("div");
      coin.className = "glfc-static-coin glfc-static-coin--spinning";
      coin.dataset.good = labels.good;
      coin.dataset.bad = labels.bad;
      row.appendChild(coin);
      return coin;
    });
  }

  playToss() {
    return new Promise((resolve) => {
      window.setTimeout(() => {
        this.payload.coins.forEach((coin, index) => {
          const el = this.coinEls[index];
          if (!el) return;
          el.classList.remove("glfc-static-coin--spinning");
          el.classList.add(coin.good ? "glfc-static-coin--good" : "glfc-static-coin--bad");
          el.textContent = coin.good ? el.dataset.good : el.dataset.bad;
        });
        resolve();
      }, 900);
    });
  }

  dispose() {
    if (this.el) {
      this.el.hidden = true;
      this.el.replaceChildren();
    }
    this.coinEls = [];
  }
}
