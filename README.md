# Drac Plugins

**English** · [Español](README.es.md)

Claude Code plugins and mods by [Marc Mayol](https://github.com/marcmayol), in one marketplace.

| Plugin | What it does |
| --- | --- |
| [meter-for-claude-code](plugins/meter-for-claude-code) | Your plan usage at the bottom right of the prompt: `5h 42% · 7d 20% · M 7%`. The 5-hour and weekly windows as `/usage` reports them, plus an estimated month calibrated from your transcripts. `/meter` for resets and past weeks. |
| [context-bar](plugins/context-bar) | The context window as a bar next to the meter, with a mark where auto-compact runs: `ctx ━━━━━━━───┃─ 58% · compact 84%`. Green while there is room, amber 25 points before the compact, red 10 before. |
| [humanizar](plugins/humanizar) | Cleans and scores Spanish text (0-100) so it doesn't read like AI: invisible characters, Unicode bold, filler, "it's not X, it's Y", em dashes, hashtag walls. `/humanizar` for posts, articles, emails or READMEs. Local heuristics, no API. |
| [omoikane](https://github.com/marcmayol/omoikane) | Long-term memory: what Claude learns in one session comes back in the next. One local SQLite file, duplicate detection, and on every prompt only the memories that really relate to it (or nothing). Needs the `omoi` binary. |
| [creality-print](https://github.com/marcmayol/claude-code-creality-print-plugin) | Slice with Creality Print, check gcode against the real bed, colours and mixed filaments, CFS slots, and run Creality OS printers (K2, K1…). Unofficial. |

## Install

At the prompt of a Claude Code terminal session:

```text
/plugin marketplace add marcmayol/drac-plugins
/plugin install meter-for-claude-code@drac
/plugin install context-bar@drac
/plugin install humanizar@drac
/plugin install creality-print@drac
/plugin install omoikane@drac
```

From a shell:

```bash
claude plugin marketplace add marcmayol/drac-plugins
claude plugin install meter-for-claude-code@drac
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `marcmayol/drac-plugins`, then Add plugin.

## Older Claude Code versions

meter-for-claude-code, context-bar and humanizar are hooks modules (mods): they run inside Claude Code and need nothing else installed. Claude Code 2.1.310 loads them for installed plugins on its own; older versions (2.1.282, for one) skip them unless `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` is set in the environment. If `/meter` is an unknown command or the footer shows nothing, run `claude update` or set that variable.

## Adding a plugin

A plugin either lives here under `plugins/<name>/` (`"source": "./plugins/<name>"`) or keeps its own repository and is only listed (`"source": { "source": "github", "repo": "<owner>/<repo>" }`). Add its entry to [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) and check it with:

```bash
claude plugin validate .
claude plugin validate ./plugins/<name>
```

MIT © Marc Mayol
