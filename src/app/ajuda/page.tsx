import { IntranetPage } from '../_components/intranet/IntranetPage'

export default function AjudaPage() {
  return (
    <IntranetPage
      kicker="Suporte"
      title="Ajuda"
      subtitle="Canal da equipe é WhatsApp. Dúvidas de sistema, permissão ou publicação de conteúdo:"
    >
      <ul className="list-disc space-y-2 rounded-2xl border border-border bg-card px-8 py-5 text-sm">
        <li>Operação do salão: módulo Frente de caixa (Hoje, Pipeline, Contatos).</li>
        <li>Solicitações e aprovações: RomFlow.</li>
        <li>Notícias e eventos: marketing publica em Empresa.</li>
        <li>Acessos nominais: admin em Pessoas.</li>
      </ul>
    </IntranetPage>
  )
}
