/** Race a promise against a soft deadline; never invents data — caller supplies fallback. */
export async function softTimeout<T>(
  work: Promise<T>,
  ms: number,
  fallback: () => T,
): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return work
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback()), ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
