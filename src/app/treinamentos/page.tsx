import Link from 'next/link'
import { IntranetPage } from '../_components/intranet/IntranetPage'

export default function TreinamentosPage() {
  return (
    <IntranetPage
      kicker="Academia"
      title="Treinamentos"
      subtitle="O acervo de vídeos da unidade continua no onboarding. Esta página é a porta da intranet."
    >
      <Link
        href="/onboarding"
        className="inline-flex rounded-2xl border border-border bg-card px-5 py-4 text-sm font-medium transition-colors hover:bg-background"
      >
        Abrir onboarding e vídeos
      </Link>
    </IntranetPage>
  )
}
