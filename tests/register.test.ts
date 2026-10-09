import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { CommandRunInput, RenderPropsOf, TurnCompleteInput, TurnStartInput } from 'claude-code'

tier('user')

const START = 1_000_000

const bandProps: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 }, view: {},
}

const cmd = (args: string): CommandRunInput => ({
  command: 'pushups', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 },
})

const turnStart = (turnId: string, text: string): TurnStartInput => ({ text, turnId } as TurnStartInput)

const turnDone = (turnId: string, durationMs: number, isAborted = false): TurnCompleteInput => ({
  answer: 'ok', durationMs, isAborted, turnId, reason: 'answer', usage: undefined,
} as unknown as TurnCompleteInput)

function world(on: Parameters<typeof mock.store>[0]) {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: ['quiet'] }))
}

const mount = ($: Parameters<Parameters<typeof test>[1]>[0]) =>
  $.ui.mount({ plugin: 'press-ups', surface: 'desktop', component: 'AbovePrompt', props: bandProps })

const alt = async (ui: Awaited<ReturnType<typeof mount>>) => (await ui.find({ type: 'Svg' }))?.props.alt

describe('press-ups band', () => {
  test('shows nothing until a turn starts, then the predicted press-ups', async ($, on) => {
    mock.clock(on, { now: START })
    mock.store(on, {})
    world(on)
    const ui = await mount($)
    expect(await alt(ui)).toBeUndefined()
    await $.turn.start(turnStart('t1', 'fix the bug'))
    expect(await alt(ui)).toBe('Press-ups: 0/5, 20s left')
  })

  test('a finished turn leaves a done row, an aborted one clears it', async ($, on) => {
    mock.clock(on, { now: START })
    mock.store(on, {})
    world(on)
    const ui = await mount($)
    await $.turn.start(turnStart('t2', 'one'))
    await $.turn.complete(turnDone('t2', 12_000))
    expect(await alt(ui)).toBe('Nice work: ✓ 5, 5 today')
    await $.turn.start(turnStart('t3', 'two'))
    await $.turn.complete(turnDone('t3', 3_000, true))
    expect(await alt(ui)).toBeUndefined()
  })

  test('hard mode asks for more, and finished press-ups are logged', async ($, on) => {
    mock.clock(on, { now: START })
    mock.store(on, {})
    world(on)
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    const ui = await mount($)
    expect((await $.command.run(cmd('mode hard')))?.text).toContain('hard')
    await $.turn.start(turnStart('t4', 'go'))
    expect(await alt(ui)).toBe('Press-ups: 0/8, 20s left')
    await $.turn.complete(turnDone('t4', 15_000))
    await $.turn.start(turnStart('t5', 'again'))
    await $.turn.complete(turnDone('t5', 15_000))
    const text = (await $.command.run(cmd('')))?.text ?? ''
    expect(text).toContain('this session  16')
    expect(text).toContain('today         16')
    expect(text).toContain('all time      16')
  })
})
