# context-bar

**English** · [Español](README.es.md)

A Claude Code mod: how full the session's context window is, as a bar in the footer, with a mark where auto-compact kicks in. You see it coming instead of finding out when it happens.

```text
⏵⏵ auto mode on          ctx ━━━━━━━───┃─ 58% · compact 84% · 5h 42% · 7d 20% · M 7%
```

- The bar is the model's whole window, 0 to 100%.
- `┃` is where auto-compact runs, read from Claude Code itself (your model, your settings), and `compact 84%` says the same in figures. With auto-compact off there is no mark and the colours count up to 100%.
- **Green** while there is room, **amber** 25 points before the compact, **red** 10 points before it. Both are settings (`warnPoints`, `dangerPoints`) in `/config`.
- Before the first response of a window (a new, resumed or compacted session) the engine has no figure yet: the bar shows a local count with `~` until the next response brings the real one.

It sits next to [meter-for-claude-code](../meter-for-claude-code) on the same line. Where the footer is short it gives up `compact 84%` first, then the bar, then itself.

## Install

```text
/plugin marketplace add marcmayol/drac-plugins
/plugin install context-bar@drac
```

## How it works

- `session.measure` hands over `context.percent` after each response; every 3 seconds it reads `$.session.usage()` again (a free call), because a resume, a rewind or a compaction changes the fill without a measurement.
- `$.session.usage({ breakdown: 'summary' })`, a local estimate, gives `autoCompactThreshold` and whether auto-compact is on. It is read again when the model's window changes.
- A `ui.render` hook on `SessionMode` draws the bar before whatever is beneath it in the footer.

## Development

```bash
claude plugin validate .
claude plugin test .
```

MIT © Marc Mayol
