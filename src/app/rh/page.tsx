import Link from 'next/link'
import { IntranetPage } from '../_components/intranet/IntranetPage'

export default function RhPage() {
  return (
    <IntranetPage kicker="Gente" title="RH">
      <p className="text-sm text-muted">
        Benefícios, férias e admissões desta unidade passam pelo RomFlow (área RH).
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link href="/flow?area=rh" className="rounded-2xl border border-border bg-card p-5">
          <p className="font-medium">Abrir solicitação de RH</p>
          <p className="mt-1 text-sm text-muted">Férias, admissão, desligamento, benefícios.</p>
        </Link>
        <Link href="/pessoas" className="rounded-2xl border border-border bg-card p-5">
          <p className="font-medium">Diretório</p>
          <p className="mt-1 text-sm text-muted">Quem está nesta intranet.</p>
        </Link>
      </div>
    </IntranetPage>
  )
}
