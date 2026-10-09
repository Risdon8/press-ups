import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Result, Run } from '../types'

// Push-ups for the wait. The prediction is the median of recent turns of the
// same size, kept in $.store across sessions. No model is called, so no tokens.

const run = atom({ plugin: 'push-ups', key: 'run' } as const, null)
const now = atom({ plugin: 'push-ups', key: 'now' } as const, 0)
const result = atom({ plugin: 'push-ups', key: 'result' } as const, null)
const session = atom({ plugin: 'push-ups', key: 'session' } as const, 0)

const HISTORY = 10
const MIN_SAMPLES = 3
const DEFAULT_MS = { short: 15_000, medium: 30_000, long: 45_000 }
const MIN_PREDICT_MS = 8_000
const MAX_PREDICT_MS = 90_000
// Seconds of predicted wait per push-up, and the most one turn asks for.
const MODES = {
  easy: { ms: 6_000, max: 20 },
  medium: { ms: 4_000, max: 30 },
  hard: { ms: 2_500, max: 60 },
}
const MIN_PUSHUPS = 2
const TICK_MS = 1_000

const CLAY = '#D97757'
const DONE = '#5fbf8f'

type Bucket = keyof typeof DEFAULT_MS
type Mode = keyof typeof MODES

const bucketOf = (text: string): Bucket => {
  const n = text.trim().length
  return n < 80 ? 'short' : n < 300 ? 'medium' : 'long'
}

const fmtSec = (ms: number): string => `${Math.max(0, Math.round(ms / 1000))}s`

const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const history = async ($: EngineInterface, bucket: Bucket | 'all'): Promise<number[]> => {
  const past = await $.store.get(`hist:${bucket}`)
  return Array.isArray(past) ? past.filter((x): x is number => typeof x === 'number') : []
}

const isMode = (x: unknown): x is Mode => x === 'easy' || x === 'medium' || x === 'hard'

async function readMode($: EngineInterface): Promise<Mode> {
  const mode = await $.store.get('mode')
  return isMode(mode) ? mode : 'medium'
}

const pad = (n: number): string => String(n).padStart(2, '0')

const dayKey = (ms: number): string => {
  const d = new Date(ms)
  return `day:${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const asCount = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0)

/** Adds finished push-ups to today's count and the all-time total; answers today's count. */
async function logReps($: EngineInterface, reps: number): Promise<number> {
  const key = dayKey(await $.clock.now())
  const today = asCount(await $.store.get(key)) + reps
  await $.store.set(key, today)
  await $.store.set('all', asCount(await $.store.get('all')) + reps)
  return today
}

async function statsText($: EngineInterface, sessionCount: number): Promise<string> {
  const mode = await readMode($)
  const nowMs = await $.clock.now()
  let week = 0
  for (let i = 0; i < 7; i++) week += asCount(await $.store.get(dayKey(nowMs - i * 86_400_000)))
  const today = asCount(await $.store.get(dayKey(nowMs)))
  const all = asCount(await $.store.get('all'))
  return [
    `push-ups, ${mode} mode (one per ${MODES[mode].ms / 1000}s of predicted wait, up to ${MODES[mode].max} a turn)`,
    `this session  ${sessionCount}`,
    `today         ${today}`,
    `last 7 days   ${week}`,
    `all time      ${all.toLocaleString('en-US')}`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// What the band shows for one moment: running, past the prediction, or done.

type View = {
  phase: 'running' | 'over' | 'done'
  ratio: number
  reps: number
  total: number
  title: string
  pill: string
  right: string
}

export const viewOf = (r: Run | null, res: Result | null, t: number): View | null => {
  if (res !== null) {
    return { phase: 'done', ratio: 1, reps: res.total, total: res.total, title: 'Nice work', pill: `✓ ${res.reps}`, right: `${res.today.toLocaleString('en-US')} today` }
  }
  if (r === null) return null
  const elapsed = Math.max(0, t - r.startedAt)
  if (elapsed > r.predictedMs) {
    return { phase: 'over', ratio: 1, reps: r.total, total: r.total, title: 'Keep going', pill: `${r.total}+`, right: `+${fmtSec(elapsed - r.predictedMs)}` }
  }
  const ratio = elapsed / r.predictedMs
  const reps = Math.min(r.total, Math.floor(ratio * r.total))
  return { phase: 'running', ratio, reps, total: r.total, title: 'Push Ups', pill: `${reps}`, right: `${fmtSec(r.predictedMs - elapsed)} left` }
}

// ---------------------------------------------------------------------------
// Desktop: the whole row is one SVG (the dithered bar of savvy-progress, with a
// small figure doing push-ups). Terminal: the same row in text.

const H = 24
const BAR_H = 16
const CELL = 3
const FIG_W = 32
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const noise = (a: number, b: number): number => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return x - Math.floor(x)
}

// Rough advance of system UI text, in em; enough to size the title's slot.
const charEm = (ch: string): number =>
  /[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-Z@%]/.test(ch) ? 0.72 : 0.56

const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

/** A side-on figure: hands and feet stay on the floor, the shoulder rises and falls. */
const figure = (color: string, isMoving: boolean): string => {
  const fx = 28, fy = 21, hx = 5, sx = 8
  const up = 15.5, down = 19
  const head = (ys: number) => {
    const dx = sx - fx, dy = ys - fy, len = Math.hypot(dx, dy)
    return { cx: +(sx + (dx / len) * 5).toFixed(2), cy: +(ys + (dy / len) * 5).toFixed(2) }
  }
  const a = head(up), b = head(down)
  const anim = (attr: string, v1: number, v2: number) => isMoving
    ? `<animate attributeName="${attr}" values="${v1};${v2};${v1}" keyTimes="0;.5;1" calcMode="spline" keySplines=".4 0 .6 1;.4 0 .6 1" dur="1.6s" repeatCount="indefinite"/>`
    : ''
  return `<rect class="k" x="0" y="22.2" width="${FIG_W}" height="1.6" rx="0.8"/>
<g stroke="${color}" stroke-width="2.2" stroke-linecap="round" fill="none">
<line x1="${hx}" y1="${fy}" x2="${sx}" y2="${up}">${anim('y2', up, down)}</line>
<line x1="${sx}" y1="${up}" x2="${fx}" y2="${fy}">${anim('y1', up, down)}</line>
</g>
<circle cx="${a.cx}" cy="${a.cy}" r="2.7" fill="${color}">${anim('cx', a.cx, b.cx)}${anim('cy', a.cy, b.cy)}</circle>`
}

export const rowSvg = (v: View, W: number): string => {
  const color = v.phase === 'done' ? DONE : CLAY
  const isDone = v.phase === 'done'
  const BAR_X = Math.round(FIG_W + 10 + textWidth(v.title, 13) + 12)
  const BAR_W = Math.max(60, W - BAR_X - 74)
  const y0 = (H - BAR_H) / 2
  const fillW = Math.round(BAR_W * v.ratio)
  const dots: string[] = []

  // Dithered fill: sparse at the start, dense toward the head.
  const cols = Math.floor(fillW / CELL)
  const rows = Math.floor(BAR_H / CELL)
  for (let c = 0; c < cols; c++) {
    const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
    for (let r = 0; r < rows; r++) {
      if (noise(c, r) < density) dots.push(`<rect class="t${Math.floor(noise(r, c) * 4)}" x="${c * CELL + 1}" y="${r * CELL + 1}" width="2" height="2"/>`)
    }
  }

  // One tick per push-up still to do.
  const ticks: string[] = []
  for (let i = 1; i < v.total; i++) {
    const x = Math.round((BAR_W * i) / v.total)
    if (x > fillW + 4) ticks.push(`<rect x="${x}" y="${BAR_H / 2 - 4}" width="1.5" height="8" rx="0.75"/>`)
  }

  const pillW = Math.round(18 + v.pill.length * 6.6)
  const pillX = Math.max(0, Math.min(BAR_W - pillW, fillW - pillW))

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
.t{fill:#1f1f1f}.m{fill:#8a8a8a}.k{fill:#e4e4e2}.tk{fill:#b4b4b0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}.k{fill:#2c2c2c}.tk{fill:#5a5a5a}}
.t0,.t1,.t2,.t3{animation:tw ${isDone ? 3.2 : 2.2}s ease-in-out infinite}
.t1{animation-duration:${isDone ? 3.8 : 2.8}s;animation-delay:-.7s}.t2{animation-duration:${isDone ? 4.4 : 1.9}s;animation-delay:-1.3s}.t3{animation-duration:${isDone ? 3.5 : 3.3}s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:${isDone ? 0.8 : 0.3}}}
@media (prefers-reduced-motion: reduce){.t0,.t1,.t2,.t3{animation:none}}
</style>
<defs><clipPath id="c"><rect x="0" y="0" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath></defs>
${figure(color, !isDone)}
<text class="t" x="${FIG_W + 10}" y="${H / 2 + 4.5}" font-family="${FONT}" font-size="13" font-weight="500">${xml(v.title)}</text>
<g transform="translate(${BAR_X},${y0})">
<rect class="k" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/>
<g clip-path="url(#c)">
<g fill="${color}">${dots.join('')}</g>
<g class="tk">${ticks.join('')}</g>
</g>
<rect x="${pillX}" width="${pillW}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${color}"/>
<text x="${pillX + pillW / 2}" y="${BAR_H / 2 + 4}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" fill="#ffffff">${xml(v.pill)}</text>
</g>
<text class="m" x="${W - 2}" y="${H / 2 + 4.5}" text-anchor="end" font-family="${FONT}" font-size="12.5" font-variant-numeric="tabular-nums">${xml(v.right)}</text>
</svg>`
}

const barText = (ratio: number, width: number): string => {
  const filled = Math.round(width * ratio)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

// ---------------------------------------------------------------------------

let ticking: { cancel: () => void } | null = null
let activeTurn = ''

function stopTicking() {
  if (ticking) ticking.cancel()
  ticking = null
}

function tick($: EngineInterface) {
  ticking = $.clock.after(TICK_MS, async () => {
    ticking = null
    if (!activeTurn) return
    const t = await $.clock.now()
    await update($, now, () => t)
    if (activeTurn) tick($)
  })
}

export const register: Register = on => {
  on('turn.start', async ($, e, next) => {
    const r = await next(e)
    stopTicking()

    const bucket = bucketOf(e.text)
    // This prompt size's own turns first, then every turn so far, then a default.
    const own = await history($, bucket)
    const every = await history($, 'all')
    const guess = own.length >= MIN_SAMPLES ? median(own) : every.length >= MIN_SAMPLES ? median(every) : DEFAULT_MS[bucket]
    const predictedMs = Math.min(MAX_PREDICT_MS, Math.max(MIN_PREDICT_MS, guess))
    const mode = MODES[await readMode($)]
    const total = Math.min(mode.max, Math.max(MIN_PUSHUPS, Math.round(predictedMs / mode.ms)))
    const startedAt = await $.clock.now()

    activeTurn = e.turnId
    await update($, result, () => null)
    await update($, now, () => startedAt)
    await update($, run, () => ({ turnId: e.turnId, startedAt, predictedMs, total, bucket }))
    tick($)
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId || e.turnId !== activeTurn) return r

    activeTurn = ''
    stopTicking()
    const mine = await read($, run)
    await update($, run, () => null)
    if (mine === null) {
      await update($, result, () => null)
      return r
    }

    // Only the push-ups the wait covered count, whether the turn finished early, ran on or was interrupted.
    const reps = Math.min(mine.total, Math.floor((Math.max(0, e.durationMs) / mine.predictedMs) * mine.total))
    if (!e.isAborted) {
      for (const key of [mine.bucket, 'all'] as const) {
        const hist = [...(await history($, key)), e.durationMs].slice(-HISTORY)
        await $.store.set(`hist:${key}`, hist)
      }
    }
    if (reps === 0) {
      await update($, result, () => null)
      return r
    }

    const today = await logReps($, reps)
    await update($, session, n => n + reps)
    await update($, result, () => ({ tookMs: e.durationMs, predictedMs: mine.predictedMs, total: mine.total, reps, today }))
    return r
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pushups',
      description: 'Push-up totals for this session, today, the week and all time; mode easy|medium|hard (push-ups)',
      argumentHint: '[mode easy|medium|hard]',
    })
    return next(e)
  })

  on('command.run', { command: 'pushups' }, async ($, e) => {
    const words = String(e.args ?? '').trim().split(/\s+/).filter(Boolean)
    if (words[0] === 'mode') {
      if (!isMode(words[1])) return { text: `push-ups is in ${await readMode($)} mode; /pushups mode easy, medium or hard changes it` }
      await $.store.set('mode', words[1])
      return { text: `push-ups set to ${words[1]}: one per ${MODES[words[1]].ms / 1000}s of predicted wait, up to ${MODES[words[1]].max} a turn` }
    }
    return { text: await statsText($, await read($, session)) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, run)
    const res = await read($, result)
    if (e.props.hasSurvey) return next(e)

    const view = viewOf(r, res, await read($, now))
    if (view === null) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const dismiss = view.phase === 'done'
      ? <Button key="pu-dismiss" label="✕" plain role="dismiss" onPress={() => update($, result, () => null)} />
      : null
    const alt = `${view.title}: ${view.pill}, ${view.right}`

    if ('Svg' in ui) {
      const { Svg } = ui
      const width = Math.max(180, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 48))
      return (
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Svg source={rowSvg(view, width)} alt={alt} width={width} height={H} />
          {dismiss}
        </Box>
      )
    }

    const color = view.phase === 'done' ? DONE : CLAY
    const cols = e.props.bodyColumns
    const barW = Math.max(6, Math.min(40, cols - 36))
    return (
      <Box flexDirection="row" gap={2}>
        <Text color={color}>▣ <Text bold>{view.title}</Text></Text>
        <Text color={color}>{barText(view.ratio, barW)}</Text>
        <Text bold>{view.pill}</Text>
        <Text dimColor>{view.right}</Text>
        {dismiss}
      </Box>
    )
  })
}
