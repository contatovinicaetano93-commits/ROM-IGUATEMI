/**
 * One-shot: runAvecSync('fast'|'full') with env DATABASE_URL + AVEC_*.
 * Usage: npx tsx scripts/run-sync-mode.ts fast
 */
import { runAvecSync } from '../src/lib/avec/sync'

const mode = (process.argv[2] === 'full' ? 'full' : 'fast') as 'fast' | 'full'

async function main() {
  console.log('starting', mode)
  const s = await runAvecSync(mode)
  console.log(
    JSON.stringify(
      {
        id: s.id,
        kind: s.kind,
        status: s.status,
        error: s.error,
        stats: s.stats,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
