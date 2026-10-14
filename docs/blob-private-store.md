# Vercel Blob — store privado para PII (currículos, recibos, checks)

## Sintoma

```
[curriculos/POST] Vercel Blob: Cannot use private access on a public store.
The store must be configured with private access.
```

O app faz upload de PII com `access: 'private'`. O Blob store ligado a `BLOB_READ_WRITE_TOKEN` é **público**. Access mode do store é **imutável** após criação — não existe toggle Public → Private no console.

## Comportamento do código

1. Tenta `access: private` (default).
2. Se a API responder com o erro acima, faz **soft-fallback** para `access: public` e segue o upload (currículos, financeiro, checks-diario).
3. Downloads continuam pelos proxies autenticados (`/api/curriculos/[id]/file`, recibo, foto de check). `blobAccessFromUrl` trata hosts `.public.` e `.private.`.
4. Fail-closed (sem fallback): `BLOB_REQUIRE_PRIVATE=1` — devolve mensagem apontando este guia.
5. Forçar modo: `BLOB_UPLOAD_ACCESS=public|private` (server) e/ou `NEXT_PUBLIC_BLOB_UPLOAD_ACCESS` (client).

## Como ter store realmente privado (recomendado para PII)

Não dá para “mudar Access” do store atual. Crie um **novo** store Private e troque o token:

1. Vercel Dashboard → projeto (`rom-brasil` / `rom-iguatemi`) → **Storage**.
2. **Create Database/Storage** → **Blob**.
3. Em Access, escolha **Private** (não Public).
4. Conecte o store ao projeto (Production + Preview + Development).
5. Confirme que `BLOB_READ_WRITE_TOKEN` (e, se aparecer, `BLOB_STORE_ID`) aponta para o **novo** store.
6. Redeploy.
7. (Opcional) Remova o store público antigo só depois de migrar/aceitar URLs antigas — proxies ainda leem `.public.blob.` com o token do store correspondente; trocar o token deixa blobs do store antigo inacessíveis via SDK.

CLI (quando disponível):

```bash
vercel blob create-store rom-brasil-pii --access private
# depois conecte o store ao projeto e atualize envs
```

## Env vars

| Var | Uso |
|-----|-----|
| `BLOB_READ_WRITE_TOKEN` | Token RW do store (obrigatório) |
| `BLOB_UPLOAD_ACCESS` | Força `public` ou `private` no server |
| `NEXT_PUBLIC_BLOB_UPLOAD_ACCESS` | Força no client upload |
| `BLOB_REQUIRE_PRIVATE` | `1` = sem fallback; erro acionável se store for público |

## Paridade

Brasil e Iguatemi têm stores **separados**. Repita o procedimento nos dois projetos Vercel.
