#!/usr/bin/env bash
# Cria o repositório ROM-iguatemi no GitHub e publica este código.
# Rode na sua máquina com GitHub CLI autenticado na conta contatovinicaetano93-commits:
#   chmod +x scripts/create-iguatemi-repo.sh
#   ./scripts/create-iguatemi-repo.sh

set -euo pipefail

OWNER="${GITHUB_OWNER:-contatovinicaetano93-commits}"
REPO_NAME="${GITHUB_REPO:-ROM-iguatemi}"
VISIBILITY="${GITHUB_VISIBILITY:-private}"

if ! command -v gh >/dev/null 2>&1; then
  echo "Instale o GitHub CLI: https://cli.github.com/"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Faça login: gh auth login"
  exit 1
fi

echo "→ Criando repositório ${OWNER}/${REPO_NAME} (${VISIBILITY})..."

if gh repo view "${OWNER}/${REPO_NAME}" >/dev/null 2>&1; then
  echo "Repositório já existe. Adicionando remote e fazendo push..."
else
  gh repo create "${OWNER}/${REPO_NAME}" \
    --"${VISIBILITY}" \
    --description "ROM CLUB IGUATEMI — painel independente (contatos, KPIs, Avec, WhatsApp)" \
    --clone=false
fi

if git remote get-url iguatemi >/dev/null 2>&1; then
  git remote set-url iguatemi "https://github.com/${OWNER}/${REPO_NAME}.git"
else
  git remote add iguatemi "https://github.com/${OWNER}/${REPO_NAME}.git"
fi

CURRENT_BRANCH="$(git branch --show-current)"
echo "→ Push da branch ${CURRENT_BRANCH} para iguatemi..."
git push -u iguatemi "${CURRENT_BRANCH}:main"

echo ""
echo "✓ Repositório criado: https://github.com/${OWNER}/${REPO_NAME}"
echo "  Próximo passo: Vercel → Import Project → ${OWNER}/${REPO_NAME}"
echo "  Env vars: deploy/vercel-rom-club-iguatemi.env"
