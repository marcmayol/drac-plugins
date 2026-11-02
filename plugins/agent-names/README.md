# agent-names

**English** · [Español](README.es.md)

With several sessions open you can't tell which one a subagent belongs to, because each is named after its task. This mod has them named `Project: task`: `LinkedIn: reply to Edwin`, `Billing app: review login`.

## Install

```
/plugin marketplace add marcmayol/drac-plugins
/plugin install agent-names@drac
```

There is nothing else to do. New sessions have it.

## What it does

It explains the rule to the model in the description of the `Agent` tool, so it usually gets it right first time. If a name doesn't fit the format or runs over 60 characters, it refuses the call and says how to fix it, and the model tries again with a new name.

It only checks the shape. Whether the part before the colon really is your project is up to the model. If the mod itself fails, the subagent still starts: a naming mod shouldn't stop the work. It leaves alone the agents a plugin starts on its own, and only covers the ones the model asks for.

## Speed

It runs inside Claude Code, with no binary and nothing else to install. The check takes about 3 microseconds; starting a Rust binary to do the same costs about 8 ms on my Windows PC, which is why it doesn't ship one.

## Tests

```
claude plugin validate .
claude plugin test .
```

MIT license.
