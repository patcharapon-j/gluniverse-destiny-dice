# GLUniverse Destiny Dice

Adds a configurable Destiny Fate Die to Foundry VTT PF2e checks, Hero Point rerolls, chat cards, and Dice So Nice.

## Features

- **PF2e fate die integration** - Adds the configured Destiny Dice result to supported PF2e checks.
- **Hero Point reroll support** - Shows fate die outcomes on reroll workflows.
- **Chat card results** - Displays Opportunity, Complication, blank results, and configured values in roll output.
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

## Credits

Created by GLUniverse.
