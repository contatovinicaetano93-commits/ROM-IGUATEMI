/**
 * Lembrete no cold start quando maxDuration > 300.
 * Não detecta Fluid on/off — o sinal RED real é health `classic_300s_hits` (~280–340s).
 */
export function warnIfLongMaxDuration(route: string, maxDuration: number) {
  if (process.env.VERCEL !== '1' || maxDuration <= 300) return
  console.warn(
    `[${route}] maxDuration=${maxDuration}s needs Fluid Compute (vercel.json fluid:true). Advisory only — RED = /api/health avec.hard_timeout.classic_300s_hits > 0 (Classic 300s cap). Timeout at ~800s means Fluid is ON and the route budget was exceeded.`,
  )
}
