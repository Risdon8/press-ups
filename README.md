# Push Ups

A Claude Code mod for waiting on Claude. It predicts how long the turn will take and gives you push-ups to do in the meantime, in a bar above the prompt.

It makes no model calls, so it uses no tokens. Everything runs locally.

![The bar mid-turn: do 8 push-ups, 3 done so far, 20s left](docs/running.svg)

## What you see

**While Claude works.** A figure does push-ups, the bar fills as the predicted time passes, and the title tells you how many to do ("Do 8 push-ups") and the pill counts how many you should have done by now (`3/8`).

![Mid-turn](docs/running.svg)

**If the turn runs long.** The bar is full and the title changes. The right side counts how far past the prediction you are.

![Past the prediction](docs/over.svg)

**When it ends.** The row turns green and shows the set you finished and your total for today. It stays until you press ✕ or send your next prompt.

![Done](docs/done.svg)

These images are rendered from the mod's own drawing code (`tools/generate-previews.mjs`), so they match the real row. In Claude Code's terminal the same row is drawn in text with a `█░` bar. In the desktop app the figure and the bar animate.

## How it works

- **Prediction:** the median of your last 10 turns of a similar prompt size (short, medium, long). Until that size has 3 turns it uses the median of all your turns, and before that a default of 15s, 30s or 45s. It never predicts more than 90s.
- **The bar:** a figure doing push-ups, a dithered progress bar, the target up front, your count so far (`3/8`) and the time left. Past the prediction it says "Keep going". When the turn ends it shows what you did and your total for today.
- **Honor system:** only the push-ups the wait covered count. A turn that finishes in 5 seconds counts a couple, not a whole set, and an interrupted turn counts the share of time that passed.

## Install

Needs Claude Code 2.1.287 or later.

```sh
claude plugin marketplace add Risdon8/push-ups
claude plugin install push-ups@push-ups
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
