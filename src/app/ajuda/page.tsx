import { IntranetPage } from '../_components/intranet/IntranetPage'

export default function AjudaPage() {
  return (
    <IntranetPage kicker="Suporte" title="Ajuda">
      <p className="text-sm text-muted">
        Canal da equipe é WhatsApp. Dúvidas de sistema, permissão ou publicação de conteúdo:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
        <li>Operação do salão: módulo Frente de caixa (Hoje, Pipeline, Contatos).</li>
        <li>Solicitações e aprovações: RomFlow.</li>
        <li>Notícias e eventos: marketing publica em Empresa.</li>
        <li>Acessos nominais: admin em Pessoas.</li>
      </ul>
    </IntranetPage>
  )
}
