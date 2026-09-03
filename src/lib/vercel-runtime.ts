/** Aviso único por cold start quando maxDuration > 300 na Vercel sem Fluid Compute confirmado. */
export function warnIfLongMaxDuration(route: string, maxDuration: number) {
  if (process.env.VERCEL !== '1' || maxDuration <= 300) return
  console.warn(
    `[${route}] maxDuration=${maxDuration}s requires Vercel Fluid Compute (Pro); without it invocations cap at 300s`,
  )
}
