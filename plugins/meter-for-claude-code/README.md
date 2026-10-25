# Meter for Claude Code

A Claude Code mod from [Claude Code Meter](https://github.com/marcmayol/claude-code-meter): your plan usage at the bottom right of the prompt, on the permission mode's line.

```text
⏵⏵ auto mode on                                   5h 42% · 7d 20% · M 7%
```

- **5h**: the session window, **7d**: the weekly window, the same figures as `/usage`, read from what Claude Code already measures after each response (no extra request, no tokens spent).
- **M**: the month. The plan has no monthly quota, so M is estimated: the weekly limit in tokens comes by rule of three (tokens of the current plan week ÷ its %), and this month's tokens are measured against that limit scaled to the month's days. The plan week is anchored to its real reset, not Monday → Sunday. The best calibration (the highest weekly %) is kept across sessions; M shows once the week passes 3%.

Green under 70%, amber under 90%, red above. Where the footer is short, M goes first.

`/meter` lists both windows with their reset times, the calibrated weekly limit and your last plan weeks rebuilt from the transcripts.

Tokens come from the transcripts in `~/.claude/projects` (or `CLAUDE_CONFIG_DIR`). The ones over 4 MiB are read by `scripts/scan.mjs`, so Node needs to be on the PATH. Without Node, `/meter` says the count is partial. Cache reads are left out unless `countCacheRead` is on in `/config`.

It needs a subscription: with API key billing there are no plan windows and the footer stays as it is.

## Install

```text
/plugin install meter-for-claude-code --marketplace marcmayol/drac-plugins
```

## Development

```bash
claude plugin validate .
claude plugin test .
```

MIT © Marc Mayol
