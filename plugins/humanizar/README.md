# humanizar

**English** · [Español](README.es.md)

Cleans and scores any Spanish text (0-100) so it doesn't read like AI: a post, an article,
an email or a README. Everything runs locally: no model or API calls. It works in Claude Code
as a plugin and [in 14 other agents](#in-other-agents) as an MCP server.

## What it does

| Piece | Purpose |
|---|---|
| `humanizar` tool | Takes a list of texts and returns each one cleaned, with its score, warnings and per-check breakdown |
| `/humanizar-log` command | Shows which rules fire most ([the log](#the-log)) |
| `humanizar` skill (`/humanizar`) | Tells Claude how to use it: run the text, rewrite only what gets flagged, repeat at most twice and deliver the last text the tool returned |

### Automatic fixes (meaning-preserving)

- Invisible characters (zero-width, BOM, soft hyphen) and odd spaces.
- Unicode "bold" or "italic" letters (𝗮𝗯𝗰, 𝘢𝘣𝘤) back to plain letters.
- Filler with an exact replacement: «a día de hoy» → «hoy», «con el fin de» → «para»,
  «utilizar» → «usar»…

### Warnings (Claude rewrites them)

AI filler (including «profundizar», «dicho esto», «un sinfín de»), "it's not X, it's Y" with or without «solo», «fundamental», «crucial» and «clave» piled up in one paragraph, three adjectives in a row, short rhetorical questions, engagement bait, markdown
`**…**`, em dashes, more than 3 hashtags, more than one emoji, opening with an emoji,
sentences all the same length and vague text.

### The score

Five checks from 0 to 100: rhythm, concreteness, filler, footprint (dashes and emojis) and
voice (first person). The score blends the average with the worst check, so one serious
problem pulls it down.

## The log

Each time the tool reviews a text, it notes which rules fired. That shows you which habits the model keeps
repeating, so you can fix its instructions, or decide a rule is wrong. The idea came from Edwin Jimenez, in the
LinkedIn comments.

| Where | See the log | Empty it |
|---|---|---|
| Claude Code | `/humanizar-log` | `/humanizar-log borrar` |
| Other agents (Windows, Linux and macOS) | `humanizar log` | `humanizar log --clear` |

It keeps the date in UTC, the score and the rule names, never your text, and nothing leaves your computer. It
holds roughly the last 5000 reviews. In Claude Code it lives in the plugin's store; in the binary, in
`~/.humanizar/log.jsonl`, and `humanizar log --raw` prints it as it is. They are separate logs. To turn it off,
set `HUMANIZAR_NO_LOG=1`.

## Install in Claude Code

```
/plugin marketplace add marcmayol/drac-plugins
/plugin install humanizar@drac
```

Nothing else to install: no Python, no uv, no MCP server. Since 0.2.0 the engine runs inside Claude Code itself,
as a hooks module (`hooks/humanizar.ts`) that registers the `humanizar` tool (`mcp__humanizar__humanizar`).

## In other agents

The same tool works in the 14 agents [Omoikane](https://github.com/marcmayol/omoikane) gets ready:
Codex, Gemini CLI, Cursor, OpenCode, Qwen Code, Kiro, GitHub Copilot, Windsurf, Antigravity, Kimi Code,
Pi, Amp, Kilo Code and Grok Build. It's one binary of under 2 MB that needs nothing else: no Node, no Python, no uv, no Visual C++ Redistributable,
no particular Linux distribution, no network. It gives the same answers as the plugin, and the tests compare the two.

One command installs it and gets ready every agent it finds on your computer:

**Windows** (PowerShell)
```powershell
irm https://raw.githubusercontent.com/marcmayol/drac-plugins/main/humanizar-mcp/install.ps1 | iex
```

**Linux and macOS**
```sh
curl -fsSL https://raw.githubusercontent.com/marcmayol/drac-plugins/main/humanizar-mcp/install.sh | sh
```

Start a new session of the agent and it's there. For an agent you install later, or one that has never run
(no configuration folder yet):

```sh
humanizar setup codex      # or gemini, cursor, opencode, qwen, kiro, copilot, windsurf, antigravity, kimi, pi, amp, kilo, grok
```

To install only the binary and leave the agents alone, set `HUMANIZAR_NO_SETUP=1` first.

`setup` registers the MCP server, adds a paragraph to the agent's instructions and creates a `/humanizar`
command where the agent has user commands. Copilot, Antigravity, Kimi Code and Amp don't, and Cursor has no
global instructions file: there the tool's description does the job. It shows what it changes, keeps a copy
of each file it touches (`<file>.before-humanizar`) and does nothing twice. `--dry-run` only looks. To remove
it, delete the `humanizar` entry from the MCP config and the paragraph between the `<!-- humanizar -->` marks.

Tested end to end with OpenCode 1.19.5. Gemini CLI reads the configuration correctly. The rest go by each
agent's documentation, with the same paths as `omoi setup`.

`humanizar check <file>` gives the result in the terminal, with no agent.

## Tests

```
claude plugin validate .
claude plugin test .
cargo test --release --manifest-path ../../humanizar-mcp/Cargo.toml
```

## Credits

Idea from `li-human` in [linkedin-agent-skill](https://github.com/Jakeschincariol/linkedin-agent-skill)
(MIT), rebuilt for Spanish without its English lexicon. It started inside the social-publish
plugin.

MIT license.
