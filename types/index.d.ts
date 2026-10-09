export type Run = { turnId: string; startedAt: number; predictedMs: number; bucket: 'short' | 'medium' | 'long'; repMs: number; max: number; varied: boolean; offset: number }
export type Result = { tookMs: number; predictedMs: number; total: number; reps: number; today: number }

declare module 'claude-code' {
  interface PluginState {
    'push-ups': { run: Run | null; now: number; result: Result | null; session: number }
  }
}
