-- Unique em folha_tax_documents.source (IMAP: imap:{mailbox}:{uid}).
-- Rodar duas vezes: DELETE de extras + CREATE UNIQUE INDEX IF NOT EXISTS são no-ops.
-- Branch errada: só remove duplicatas do mesmo source (id maior) e cria índice.
-- Apaga? Sim — linhas duplicadas com o mesmo source e id maior; não DROP/TRUNCATE de tabela.

delete from folha_tax_documents a
using folha_tax_documents b
where a.source = b.source
  and a.id > b.id;

create unique index if not exists folha_tax_documents_source_uidx
  on folha_tax_documents (source);
