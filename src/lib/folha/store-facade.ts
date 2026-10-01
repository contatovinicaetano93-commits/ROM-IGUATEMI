/**
 * Fachada de leitura 8123 + store Folha (evita service importar sync pesado demais).
 */

import { todayIsoSaoPaulo } from '@/lib/folha/period'
import {
  getFolhaPeriod,
  getLatestFolhaPeriod,
  saveFolhaPeriodLines,
  updateFolhaPeriodStatus,
  upsertFolhaPeriodFromDraft,
} from '@/lib/folha/store'
import {
  getLatestSalonCommissionsDaily,
  getSalonCommissionsDailyNear,
  type SalonCommissionsDaily,
} from '@/lib/salon/commission-metrics'

export {
  getFolhaPeriod,
  getLatestFolhaPeriod,
  saveFolhaPeriodLines,
  updateFolhaPeriodStatus,
  upsertFolhaPeriodFromDraft,
}
export type { FolhaPeriodRow } from '@/lib/folha/store'

export async function getLatestSalonCommissionsNearOrLatest(
  anchorDay?: string,
): Promise<SalonCommissionsDaily | null> {
  const day = anchorDay ?? todayIsoSaoPaulo()
  return (
    (await getSalonCommissionsDailyNear(day, { maxSkewDays: 45 })) ??
    (await getLatestSalonCommissionsDaily())
  )
}
