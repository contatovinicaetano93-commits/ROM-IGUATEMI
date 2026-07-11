#!/usr/bin/env bash
#
# Verificação pós-deploy — ROM Club (Brasil / Iguatemi)
#
# Uso:
#   bash scripts/post-deploy-verification.sh
#   bash scripts/post-deploy-verification.sh https://rom-club.vercel.app
#   bash scripts/post-deploy-verification.sh https://rom-iguatemi.vercel.app
#
# Health completo (readiness, Avec, cron):
#   ROM_ACCESS_TOKEN=... bash scripts/post-deploy-verification.sh https://rom-club.vercel.app
#
set -euo pipefail

DEFAULT_URLS=(
  "https://rom-club.vercel.app"
  "https://rom-iguatemi.vercel.app"
)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✅${NC} $1"; }
fail() { echo -e "  ${RED}❌${NC} $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "  ${YELLOW}⚠️${NC}  $1"; }

strip_trailing_slash() {
  local url="${1%/}"
  echo "$url"
}

json_ok() {
  node -e "
    const fs = require('fs');
    const raw = fs.readFileSync(0, 'utf8').trim();
    if (!raw) { process.exit(1); }
    try {
      const j = JSON.parse(raw);
      const ok = j?.data?.ok ?? j?.ok;
      process.exit(ok === true ? 0 : 1);
    } catch {
      process.exit(1);
    }
  " <<<"$1"
}

json_field() {
  local field="$1"
  node -e "
    const fs = require('fs');
    const raw = fs.readFileSync(0, 'utf8').trim();
    const j = JSON.parse(raw);
    const data = j?.data ?? j;
    const path = process.argv[1].split('.');
    let cur = data;
    for (const p of path) cur = cur?.[p];
    if (cur === undefined || cur === null) process.exit(1);
    if (typeof cur === 'object') console.log(JSON.stringify(cur));
    else console.log(String(cur));
  " "$field" <<<"$2"
}

check_unit() {
  local base
  base="$(strip_trailing_slash "$1")"
  local name="${2:-$base}"

  echo ""
  echo "## $name"
  echo "   $base"
  echo ""

  local health_code health_body
  health_code="$(curl -sS -o /tmp/rom-health.json -w "%{http_code}" "${base}/api/health" || echo "000")"
  health_body="$(cat /tmp/rom-health.json 2>/dev/null || true)"

  if [[ "$health_code" == "200" ]]; then
    pass "GET /api/health → 200"
  else
    fail "GET /api/health → ${health_code} (esperado 200)"
    return
  fi

  if json_ok "$health_body"; then
    pass "Health público → ok: true (banco conectado)"
  else
    fail "Health público → ok não é true"
    echo "       resposta: ${health_body}"
  fi

  local login_code
  login_code="$(curl -sS -o /dev/null -w "%{http_code}" "${base}/login" || echo "000")"
  if [[ "$login_code" == "200" ]]; then
    pass "GET /login → 200"
  else
    fail "GET /login → ${login_code} (esperado 200)"
  fi

  local hoje_code
  hoje_code="$(curl -sS -o /dev/null -w "%{http_code}" "${base}/hoje" || echo "000")"
  if [[ "$hoje_code" == "307" || "$hoje_code" == "302" || "$hoje_code" == "200" ]]; then
    pass "GET /hoje → ${hoje_code} (painel protegido ou aberto)"
  else
    fail "GET /hoje → ${hoje_code} (esperado redirect ou 200)"
  fi

  if [[ -n "${ROM_ACCESS_TOKEN:-}" ]]; then
    local full_body full_code
    full_code="$(curl -sS -o /tmp/rom-health-full.json -w "%{http_code}" \
      -H "Authorization: Bearer ${ROM_ACCESS_TOKEN}" \
      "${base}/api/health" || echo "000")"
    full_body="$(cat /tmp/rom-health-full.json 2>/dev/null || true)"

    if [[ "$full_code" == "200" ]]; then
      pass "GET /api/health (auth) → 200"
    else
      fail "GET /api/health (auth) → ${full_code} — confira ROM_ACCESS_TOKEN"
      return
    fi

    local panel db cron webhook
    panel="$(json_field "panel.display_name" "$full_body" 2>/dev/null || echo "?")"
    db="$(json_field "database.connected" "$full_body" 2>/dev/null || echo "false")"
    cron="$(json_field "readiness.cron_ready" "$full_body" 2>/dev/null || echo "false")"
    webhook="$(json_field "readiness.webhook_ready" "$full_body" 2>/dev/null || echo "false")"

    pass "Painel: ${panel}"
    [[ "$db" == "true" ]] && pass "Database conectado" || fail "Database desconectado"
    [[ "$cron" == "true" ]] && pass "CRON_SECRET configurado" || warn "CRON_SECRET ausente"
    [[ "$webhook" == "true" ]] && pass "AVEC_WEBHOOK_SECRET configurado" || warn "AVEC_WEBHOOK_SECRET ausente"
  else
    warn "ROM_ACCESS_TOKEN não definido — pulando health completo (readiness/Avec)"
  fi
}

FAILURES=0

echo "Post-deploy verification · ROM Club"
echo "Data: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if [[ $# -gt 0 ]]; then
  check_unit "$1" "Unidade informada"
else
  for url in "${DEFAULT_URLS[@]}"; do
    case "$url" in
      *iguatemi*) check_unit "$url" "ROM Club Iguatemi" ;;
      *) check_unit "$url" "ROM Club Brasil" ;;
    esac
  done
fi

echo ""
if [[ "$FAILURES" -eq 0 ]]; then
  echo -e "${GREEN}✅ Verificação OK${NC}"
  exit 0
else
  echo -e "${RED}❌ ${FAILURES} falha(s) — corrigir antes de considerar deploy estável${NC}"
  exit 1
fi
