#!/usr/bin/env bash
# Copy every non-empty variable from .env.local to the linked Vercel project's Production
# environment. Values are piped through stdin, never put on the command line.
# Usage (after `npx vercel link`):  npm run vercel:env
set -euo pipefail

ENV_FILE="${1:-.env.local}"
[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE found"; exit 1; }
[ -d .vercel ] || { echo "Run 'npx vercel link' first"; exit 1; }

count=0
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in ''|\#*) continue ;; esac
  name="${line%%=*}"
  value="${line#*=}"
  [[ "$name" =~ ^[A-Z_][A-Z0-9_]*$ ]] || continue
  # Vercel manages its own VERCEL_* vars (e.g. the OIDC token `vercel link` writes locally).
  case "$name" in VERCEL_*) continue ;; esac
  value="${value%\"}"; value="${value#\"}"
  if [ -z "$value" ]; then echo "skip  $name (empty)"; continue; fi
  # Public/config values stay readable in the dashboard; everything else is stored as a secret.
  case "$name" in
    NEXT_PUBLIC_*|ALLOWED_EMAILS|ALPACA_LIVE_TRADING_ENABLED) kind="--no-sensitive" ;;
    *) kind="--sensitive" ;;
  esac
  printf '%s' "$value" | npx -y vercel@latest env add "$name" --environment production --force "$kind" --yes >/dev/null
  echo "set   $name"
  count=$((count + 1))
done < "$ENV_FILE"

echo "Done: $count variable(s) set in Production. Redeploy so they take effect: npx vercel deploy --prod"
