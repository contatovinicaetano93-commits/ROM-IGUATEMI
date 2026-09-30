/** Aviso único por cold start quando maxDuration > 300 na Vercel sem Fluid Compute confirmado. */
export function warnIfLongMaxDuration(route: string, maxDuration: number) {
  if (process.env.VERCEL !== '1' || maxDuration <= 300) return
  console.warn(
    `[${route}] maxDuration=${maxDuration}s requires Vercel Fluid Compute (Pro); vercel.json has fluid:true but Classic still caps at 300s if Fluid is off in project Settings → Functions`,
  )
}
