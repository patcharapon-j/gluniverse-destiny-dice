# GLUniverse Destiny Dice

Adds a configurable Destiny Fate Die to Foundry VTT PF2e checks, Hero Point rerolls, chat cards, and Dice So Nice — plus a system-agnostic, full-screen cinematic **Fate Coin**.

## Features

- **Fate Coin (system-agnostic)** - A super-dramatic, full-screen coin flip with a **real rigid-body physics** toss (rendered with Babylon.js, simulated with cannon-es) for a **Boon / Bane** outcome — the coin is genuinely launched, tumbles, bounces, and settles, viewed top-down like Foundry's dice and easing into cinematic slow-motion as it lands, where a verdict-tinted shockwave ripples out across the surface. The GM stages the flip and either flips it themselves or hands it to a chosen player; the physics plays in sync on every connected client. Supports custom **texture, bump, and emission maps** per side, multi-coin flips with a configurable "Boons required" threshold, optional sound effects, and a per-client static fallback for reduced-motion / no-WebGL clients. See **[Fate Coin](#fate-coin)** below.
- **PF2e fate die integration** - Adds the configured Destiny Dice result to supported PF2e checks.
- **Hero Point reroll support** - Shows fate die outcomes on reroll workflows.
- **Chat card results** - Displays Opportunity, Complication, blank results, and configured values in roll output, rendered in the GL Universe *Etched Glass* style — a frosted-glass result card with a chamfered corner, etched registration marks, and a precision-rule reveal sweep.
- **Dice So Nice textures** - Supplies label, bump, and emissive maps for the fate die faces.
- **Terminology presets** - Pick between the default terminology (Opportunity / Complication), the *Aegis Fallen* preset (Defiance / Tyranny), or the *Tides of Destiny* preset (Tide / Storm).
- **Configurable die faces** - GMs can configure each physical face with:
  - Result kind: Opportunity, Complication, or Blank
  - Numeric value (Complication only — Opportunity carries no numeric bonus)
  - Custom PNG texture

## Installation

### Manifest URL

```text
https://github.com/patcharapon-j/gluniverse-destiny-dice/releases/latest/download/module.json
```

### Manual Installation

1. Download the latest release from the [Releases](https://github.com/patcharapon-j/gluniverse-destiny-dice/releases) page.
2. Extract `module.zip` into your Foundry VTT `Data/modules/` folder.
3. Enable **GLUniverse Destiny Dice** in your world.

## Usage

Enable the module in a PF2e world. The module adds the Destiny Fate Die to supported PF2e roll flows and renders results in chat.

For 3D dice, install and enable [Dice So Nice](https://foundryvtt.com/packages/dice-so-nice). Built-in textures include matching bump and emissive maps. Custom PNG textures are used for the face label, bump map, and emissive map.

## Fate Coin

The Fate Coin is a standalone, **system-agnostic** ceremony — it works in any game system and does not touch the PF2e fate-die mechanics.

### Flipping a coin

1. As a **GM**, click the **Fate Coin** button (coin icon) in the Token controls on the left toolbar — or call the macro API (below).
2. In the setup dialog, choose:
   - **Coins** — how many to flip (1–5). Default is 1.
   - **Boons required** — how many coins must land on the good side for the overall result to be a **Boon** (default 1, i.e. *any* Boon wins). Clamped to the number of coins.
   - **Flipper** — yourself, or any online player you want to hand the coin to.
3. The full-screen cinematic opens on **every** connected client at once. The chosen flipper sees a **Flip** button; everyone else sees a "waiting" prompt. The GM keeps a **force-flip** override in case the delegated player is away.
4. The coins tumble and settle, a **Boon / Bane** verdict is revealed, and a chat card records the result. The GM clicks **Continue** to dismiss the overlay for everyone (with an automatic timeout as a safety net).

The outcome is decided fairly and authoritatively **before** the toss (a fair 50/50 per coin). The GM then *solves a real physics launch* that lands on that decided face and broadcasts the exact launch state; every client replays the same deterministic, fixed-timestep simulation, so all players see the same genuine tumble landing on the same — already agreed — result. (A tiny final alignment corrects any rare floating-point divergence between clients.)

### Macro / script API

```js
const coin = game.modules.get("gluniverse-destiny-dice").api.fateCoin;
coin.openDialog();                                       // open the GM setup dialog
coin.flip({ count: 3, threshold: 2, flipperUserId });    // flip directly (GM only)
```

### Fate Coin configuration

Open **Configure Settings > Module Settings > GLUniverse Destiny Dice > Fate Coin > Configure**.

| Field | Description |
| --- | --- |
| Boon / Bane labels | Rename the good/bad sides (defaults: *Boon* / *Bane*) |
| Good / Bad side maps | Custom **texture**, **bump** (normal map), and **emission** map per face |
| Edge | Optional edge texture |
| Sound Effects | Optional wind-up, toss, settle, Boon, and Bane sounds |

Leave any map blank to use the built-in **procedural** default coin — the feature works out of the box with no uploaded assets. Bump maps follow Babylon's convention (supply a normal map). Reduced-motion clients (or clients without WebGL) automatically receive a simplified static result instead of the 3D cinematic, while still seeing the same outcome.

## Settings

### Terminology Preset

Open **Configure Settings > Module Settings > GLUniverse Destiny Dice > Terminology Preset**.

| Preset | Positive result | Negative result |
| --- | --- | --- |
| Default | Opportunity | Complication |
| Aegis Fallen | Defiance | Tyranny |
| Tides of Destiny | Tide | Storm |

The preset controls the labels and theme colors used in chat strips, dice tooltips, and the Fated Roll toggle.

### Dice Emission Intensity

Open **Configure Settings > Module Settings > GLUniverse Destiny Dice > Dice Emission Intensity**.

A slider from 0 to 2 (default 1.0) that controls the glow strength of the Dice So Nice emission maps. The emission map textures already carry their own color — 1.0 displays them as authored, lower values dim the glow, and higher values brighten it further. Requires a reload.

### Animation Style

Open **Configure Settings > Module Settings > GLUniverse Destiny Dice > Animation Style**.

Controls the *Etched Glass* result-card animations (per client):

| Tier | Behavior |
| --- | --- |
| Reduced | Result cards appear with a simple fade. |
| Default | Full reveal — a precision rule sweeps across the card and the result lights up behind it. |
| Cinematic | The reveal is lengthened and gains a trailing flare. |

This is force-clamped to **Reduced** whenever your operating system requests reduced motion.

### Dice Faces

Open **Configure Settings > Module Settings > GLUniverse Destiny Dice > Dice Faces**.

Each physical die face can be configured in one table:

| Field | Description |
| --- | --- |
| Result | Opportunity, Complication, or Blank |
| Value | Numeric face value (Complication only — disabled for Opportunity) |
| PNG | Texture path used for that face (leave blank to use the active preset's default) |

Dice So Nice texture changes require a Foundry reload. Result and value changes apply to future fate rolls.

## Compatibility

- **Foundry VTT**: v13+ (verified on v14)
- **System**: PF2e v7.0.0+
- **Recommended module**: Dice So Nice

## License

MIT License - See [LICENSE](LICENSE) for details.

### Third-party

The Fate Coin cinematic is rendered with **[Babylon.js](https://www.babylonjs.com/)**, vendored at `scripts/vendor/babylon.js` under the Apache-2.0 license (see `scripts/vendor/babylon-LICENSE.md` and `scripts/vendor/babylon-NOTICE.md`), and the coin flip is simulated with **[cannon-es](https://github.com/pmndrs/cannon-es)**, vendored at `scripts/vendor/cannon-es.js` under the MIT license (see `scripts/vendor/cannon-es-LICENSE.md` and `scripts/vendor/cannon-es-NOTICE.md`).

## Credits

Created by GLUniverse. Fate Coin rendered with Babylon.js and simulated with cannon-es.
