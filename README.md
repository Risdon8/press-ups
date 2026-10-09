# press-ups

A Claude Code mod for waiting on Claude. It predicts how long the turn will take and gives you press-ups to do in the meantime, in a bar above the prompt.

It makes no model calls, so it uses no tokens. Everything runs locally.

- **Prediction:** the median of your last 10 turns of a similar prompt size (short, medium, long), kept across sessions. Until it has 3 samples it uses 20s, 45s and 90s.
- **The bar:** a figure doing press-ups, a dithered progress bar, your count (`3/8`) and the time left. Past the prediction it says "Keep going". When the turn ends it shows what you did and your total for today.
- **Honor system:** a finished turn counts the full set. An interrupted turn counts the share your time covered.

## Install

Needs Claude Code 2.1.287 or later.

```sh
claude plugin marketplace add Risdon8/press-ups
claude plugin install press-ups@press-ups
```

Restart Claude Code or run `/reload-plugins`.

## Commands

    /pushups                 totals: this session, today, last 7 days, all time
    /pushups mode            show the current mode
    /pushups mode easy       one per 6s of predicted wait, up to 20 a turn
    /pushups mode medium     one per 4s, up to 30 (default)
    /pushups mode hard       one per 2.5s, up to 60

## Development

    claude plugin validate .
    claude plugin test .

MIT licensed.
