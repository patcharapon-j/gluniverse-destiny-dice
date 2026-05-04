# GLUniverse Destiny Dice

Adds Aegis Fallen Fate Die support to Foundry VTT PF2e checks, Hero Point rerolls, chat cards, and Dice So Nice.

## Features

- **PF2e fate die integration** - Adds the configured Destiny Dice result to supported PF2e checks.
- **Hero Point reroll support** - Shows fate die outcomes on reroll workflows.
- **Chat card results** - Displays Tyranny, Defiance, blank results, and configured values in roll output.
- **Dice So Nice textures** - Supplies label, bump, and emissive maps for the fate die faces.
- **Configurable die faces** - GMs can configure each physical face with:
  - Result type: Tyranny, Defiance, or Blank
  - Numeric value
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

Enable the module in a PF2e world. The module adds the Destiny Dice fate die to supported PF2e roll flows and renders results in chat.

For 3D dice, install and enable [Dice So Nice](https://foundryvtt.com/packages/dice-so-nice). Built-in textures include matching bump and emissive maps. Custom PNG textures are used for the face label, bump map, and emissive map.

## Settings

Open **Configure Settings > Module Settings > GLUniverse Destiny Dice > Dice Faces**.

Each physical die face can be configured in one table:

| Field | Description |
| --- | --- |
| Result | Tyranny, Defiance, or Blank |
| Value | Numeric face value shown in roll results |
| PNG | Texture path used for that face |

Dice So Nice texture changes require a Foundry reload. Result and value changes apply to future fate rolls.

## Compatibility

- **Foundry VTT**: v13+
- **System**: PF2e v7.0.0+
- **Recommended module**: Dice So Nice

## License

MIT License - See [LICENSE](LICENSE) for details.

## Credits

Created by GLUniverse.
