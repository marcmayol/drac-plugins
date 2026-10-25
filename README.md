# Drac Plugins

**English** · [Español](README.es.md)

Claude Code plugins and mods by [Marc Mayol](https://github.com/marcmayol), in one marketplace.

| Plugin | What it does |
| --- | --- |
| [meter-for-claude-code](plugins/meter-for-claude-code) | Your plan usage at the bottom right of the prompt: `5h 42% · 7d 20% · M 7%`. The 5-hour and weekly windows as `/usage` reports them, plus an estimated month calibrated from your transcripts. `/meter` for resets and past weeks. |
| [creality-print](https://github.com/marcmayol/claude-code-creality-print-plugin) | Slice with Creality Print, check gcode against the real bed, colours and mixed filaments, CFS slots, and run Creality OS printers (K2, K1…). Unofficial. |

## Install

At the prompt of a Claude Code terminal session:

```text
/plugin install meter-for-claude-code --marketplace marcmayol/drac-plugins
/plugin install creality-print --marketplace marcmayol/drac-plugins
```

From a shell:

```bash
claude plugin install meter-for-claude-code --marketplace marcmayol/drac-plugins
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `marcmayol/drac-plugins`, then Add plugin.

## Adding a plugin

A plugin either lives here under `plugins/<name>/` (`"source": "./plugins/<name>"`) or keeps its own repository and is only listed (`"source": { "source": "github", "repo": "<owner>/<repo>" }`). Add its entry to [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) and check it with:

```bash
claude plugin validate .
claude plugin validate ./plugins/<name>
```

MIT © Marc Mayol
