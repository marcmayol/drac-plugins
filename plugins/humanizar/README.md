# humanizar · Claude Code plugin

**English** · [Español](README.es.md)

Cleans and scores any Spanish text (0-100) so it doesn't read like AI: a post, an article,
an email or a README. Everything runs locally: no model or API calls.

## What it does

| Piece | Purpose |
|---|---|
| `humanizar` tool | Takes a list of texts and returns each one cleaned, with its score, warnings and per-check breakdown |
| `humanizar` skill (`/humanizar`) | Tells Claude how to use it: run the text, rewrite only what gets flagged, repeat at most twice and deliver the last text the tool returned |

### Automatic fixes (meaning-preserving)

- Invisible characters (zero-width, BOM, soft hyphen) and odd spaces.
- Unicode "bold" or "italic" letters (𝗮𝗯𝗰, 𝘢𝘣𝘤) back to plain letters.
- Filler with an exact replacement: «a día de hoy» → «hoy», «con el fin de» → «para»,
  «utilizar» → «usar»…

### Warnings (Claude rewrites them)

AI filler, "it's not X, it's Y", short rhetorical questions, engagement bait, markdown
`**…**`, em dashes, more than 3 hashtags, more than one emoji, opening with an emoji,
sentences all the same length and vague text.

### The score

Five checks from 0 to 100: rhythm, concreteness, filler, footprint (dashes and emojis) and
voice (first person). The score blends the average with the worst check, so one serious
problem pulls it down.

## Install

```
/plugin install humanizar --marketplace marcmayol/drac-plugins
```

Requires [uv](https://docs.astral.sh/uv/): the MCP server runs with `uv run --script` and
its only dependency is `mcp`.

## Tests

```
uv run --with pytest pytest tests
```

## Credits

Idea from `li-human` in [linkedin-agent-skill](https://github.com/Jakeschincariol/linkedin-agent-skill)
(MIT), rebuilt for Spanish without its English lexicon. It started inside the social-publish
plugin.

MIT license.
