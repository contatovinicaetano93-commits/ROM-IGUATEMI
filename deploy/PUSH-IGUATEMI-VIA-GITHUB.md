# Sincronizar código para ROM-IGUATEMI (sem terminal local)

Use quando o `git push` falhar com `cursor[bot] denied`.

## 1. Criar Personal Access Token (PAT)

1. Abra: https://github.com/settings/tokens?type=beta  
   (ou Classic token com escopo `repo`)
2. **Generate new token**
3. Nome: `rom-iguatemi-sync`
4. Repositórios: selecione **`ROM-IGUATEMI`** (acesso de escrita)
5. Permissões: **Contents** → Read and write
6. Copie o token (`github_pat_...` ou `ghp_...`)

## 2. Adicionar secret no repositório ROM

1. Abra: https://github.com/contatovinicaetano93-commits/ROM/settings/secrets/actions
2. **New repository secret**
3. Name: `ROM_IGUATEMI_PAT`
4. Value: cole o token
5. **Add secret**

## 3. Rodar o workflow

1. Abra: https://github.com/contatovinicaetano93-commits/ROM/actions/workflows/sync-iguatemi-repo.yml
2. **Run workflow** → branch `main` → **Run workflow**
3. Aguarde ficar verde ✅

## 4. Conferir

https://github.com/contatovinicaetano93-commits/ROM-IGUATEMI  

Deve listar `src/`, `package.json`, `deploy/`, etc.

## Próximo passo

Neon + Vercel — ver `deploy/SETUP-IGUATEMI.md`
