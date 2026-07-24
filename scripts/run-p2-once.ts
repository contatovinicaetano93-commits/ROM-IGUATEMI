import { syncP2Kpis, syncPaymentMixRecent } from '../src/lib/avec/sync-p2'
import { syncP1Kpis } from '../src/lib/avec/sync-p1'
import { syncP3Kpis } from '../src/lib/avec/sync-p3'

async function main() {
  const stats = { snapshots_saved: 0, errors: [] as string[], warnings: [] as string[], p1_rows: 0, p2_rows: 0, p3_rows: 0 }
  await syncPaymentMixRecent(stats, undefined, 7)
  await syncP2Kpis(stats)
  await syncP1Kpis(stats)
  await syncP3Kpis(stats)
  console.log(JSON.stringify(stats, null, 2))
}
main().catch((e) => { console.error(e); process.exit(1) })
