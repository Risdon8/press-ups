import { viewOf, rowSvg } from './mod.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const W = 720, PADX = 18, PADY = 12, H = 24
const wrap = (inner, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W + PADX * 2}" height="${H + PADY * 2}" viewBox="0 0 ${W + PADX * 2} ${H + PADY * 2}" role="img" aria-label="${label}">
<style>.bg{fill:#f6f6f4;stroke:#e0e0dc}@media (prefers-color-scheme: dark){.bg{fill:#1c1c1c;stroke:#333}}</style>
<rect class="bg" x="0.5" y="0.5" width="${W + PADX * 2 - 1}" height="${H + PADY * 2 - 1}" rx="10"/>
<g transform="translate(${PADX},${PADY})">${inner}</g>
</svg>
`
const run = { turnId: 't', startedAt: 0, predictedMs: 32_000, total: 8, bucket: 'medium' }
const states = {
  running: viewOf(run, null, 12_000),
  over: viewOf(run, null, 41_000),
  done: viewOf(null, { tookMs: 29_000, predictedMs: 32_000, total: 8, reps: 7, today: 48 }, 0),
}
mkdirSync('out', { recursive: true })
for (const [name, v] of Object.entries(states)) {
  writeFileSync(`out/${name}.svg`, wrap(rowSvg(v, W), `push-ups bar, ${name}: ${v.title}, ${v.pill}, ${v.right}`))
  console.log(name, v.title, v.pill, v.right)
}
