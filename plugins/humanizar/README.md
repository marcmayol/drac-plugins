# humanizar

**English** · [Español](README.es.md)

Cleans and scores any Spanish text (0-100) so it doesn't read like AI: a post, an article,
an email or a README. Everything runs locally: no model or API calls. It works in Claude Code
as a plugin and [in 14 other agents](#in-other-agents) as an MCP server.

## What it does

| Piece | Purpose |
|---|---|
| `humanizar` tool | Takes a list of texts and returns each one cleaned, with its score, warnings and per-check breakdown |
| Automatic mode | Checks only Spanish product text while Claude works ([below](#automatic-mode)) |
| `/humanizar-auto` command | Turns automatic mode on (`on`), off (`off`) or shows its state |
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

Since 2.0 it also covers what the no-ai-slop skill looks for, in Spanish: trailing gerunds that fake
analysis («…, destacando su compromiso»), importance puffery («marca un hito»), lines that tell the
reader what to think («lo importante es»), weasel attribution («los expertos coinciden»), colon
reveals («Lo mejor: …»), passives with no subject («se volverá a intentar») and fake-profound
endings («Así de simple»). Given several texts of one piece, `coherencia` flags different words for
the same thing («Finalizar» and «Terminar», «teléfono» and «móvil»).

### The score

Five checks from 0 to 100: rhythm, concreteness, filler, footprint (dashes and emojis) and
voice (first person). The score blends the average with the worst check, so one serious
problem pulls it down.

## Automatic mode

On by default. It only looks at **Spanish product text**, the text other people will read.

| Where | What it does |
|---|---|
| Write and Edit of .md, .mdx, .txt, .html, .rst, .adoc, .eml | Applies the safe fixes before writing and tells Claude what to rewrite |
| Publishing an Artifact | Checks the file unless Write already saw the same content |
| Claude Docs, Notion, Google Drive, Gmail drafts, Canva, image generation | Applies the safe fixes to the arguments and leaves the note afterwards |
| Sending an email or publishing a post (Gmail send, `send`, `publish`, `post`, `tweet`) | With warnings, stops it once so it gets fixed; the same call again goes through |
| An email, WhatsApp, Teams message or post you ask for in the chat | In that turn, fixes the quote or plain-text block and warns when the score is low |

It never touches code (.kt, .ts, .py…, code blocks, `<script>` and `<style>`), agent instructions
(CLAUDE.md, AGENTS.md, SKILL.md, memories, `.claude/`), text in other languages or ordinary chat
replies. It also adds the rules for that text to the system prompt, so it comes out clean.

Turn it off with `/humanizar-auto off` (or `HUMANIZAR_AUTO=0`). The prompt rules change in the
next conversation; the tool checks, right away.

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

### Hooked into the agent

With MCP, the agent has to remember to call the tool. Since 2.1.0, where the agent has hooks that can
change a tool's arguments, `setup` also hooks up `humanizar hook`: each time the agent is about to write a
document (.md, .txt, .html…; never code or the agents' own instructions) in Spanish, the hook fixes the
safe things before it's written and tells the model what to rewrite. Nobody has to ask.

| Agent | How it's hooked | Where |
|---|---|---|
| Qwen Code | `PreToolUse` hook on `write_file` and `edit` | `~/.qwen/settings.json` |
| Gemini CLI | `BeforeTool` (fixes) and `AfterTool` (tells) hooks on `write_file` and `replace` | `~/.gemini/settings.json` |
| Antigravity | `PreToolUse` hook (fixes) on `write_to_file` and `replace_file_content` (app and IDE) and on `write_file` and `edit_file` (`agy` CLI), and `PreInvocation` (tells the model before its next turn) | `~/.gemini/config/hooks.json` |
| The rest | MCP and the rules only | |

Not yet in the rest: their hooks can't change the arguments (Kimi Code), their docs don't say which fields
the write tool sends (Devin, Kiro, Grok Build, GitHub Copilot, Cursor), they send a patch instead of the text
(Codex), or they need TypeScript plugins (OpenCode, Kilo, Pi, Amp).

`setup` also puts the short product-text rules (active voice, one word per thing, no filler or em
dashes…) in each agent's instructions, and Windsurf, now Devin, gets them in `~/.devin/global_rules.md`
too. If an older version left them, they're brought up to date.

The hook doesn't look at chat replies and stops no sends: only the Claude Code plugin does that. Between
calls it only keeps, in the temp folder, Antigravity's note waiting for the next `PreInvocation`, and
deletes it once handed over. Tested end to end with Qwen Code 0.28, Gemini CLI 0.70 and Antigravity CLI
1.5 (write and edit, against a test model): the file ends up fixed and the model gets what to rewrite.
Turn it off with `HUMANIZAR_AUTO=0`. To remove it, delete the `humanizar` hook group from
each agent's file.

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
