#!/usr/bin/env bash
# Deploy the current working directory's app to Deno Deploy, retrying on
# TRANSIENT failures. Deno Deploy occasionally returns "An unexpected internal
# error occurred" on the first attempt; a re-run succeeds. (Mirrors the shared
# script used by the vibsync repo so the retry behaviour stays consistent.)
#
# Env:
#   DENO_DEPLOY_TOKEN    required — auth (Repository secret)
#   DENO_DEPLOY_APP      required — app name (e.g. genai-oidc-idp)
#   DENO_DEPLOY_ORG      default: loosedays
#   DENO_DEPLOY_REGION   default: global
#   DENO_DEPLOY_ATTEMPTS default: 3
#   DENO_DEPLOY_EXISTING default: 0 — set to 1 for a known existing app
#   DENO_DEPLOY_CONFIG_ONLY default: 0 — read org/app from deno.json
#
# A permanent error (bad token, build failure) still fails every attempt and
# surfaces after the last one — retry only rescues flaky deploys.
set -uo pipefail

if [ -z "${DENO_DEPLOY_TOKEN:-}" ]; then
  echo "::error::DENO_DEPLOY_TOKEN is empty. Add a Repository secret named exactly DENO_DEPLOY_TOKEN under Settings -> Secrets and variables -> Actions -> Secrets (not Variables, not an Environment secret)."
  exit 1
fi
: "${DENO_DEPLOY_APP:?DENO_DEPLOY_APP is required}"
ORG="${DENO_DEPLOY_ORG:-loosedays}"
REGION="${DENO_DEPLOY_REGION:-global}"
ATTEMPTS="${DENO_DEPLOY_ATTEMPTS:-3}"

echo "DENO_DEPLOY_TOKEN present (length ${#DENO_DEPLOY_TOKEN}). Deploying '${DENO_DEPLOY_APP}' (org ${ORG}, region ${REGION})."

deploy_once() {
  if [ "${DENO_DEPLOY_CONFIG_ONLY:-0}" = "1" ]; then
    deno deploy --prod
    return
  fi

  if [ "${DENO_DEPLOY_EXISTING:-0}" = "1" ]; then
    deno deploy --org "$ORG" --app "$DENO_DEPLOY_APP" --prod
    return
  fi

  # `create` bootstraps a brand-new app; on an app that already exists it fails
  # fast and we fall back to a normal prod deploy. Either path ships the current
  # directory, so this is safe for both first-time and repeat deploys.
  deno deploy create --org "$ORG" --app "$DENO_DEPLOY_APP" --source local --region "$REGION" \
    || deno deploy --org "$ORG" --app "$DENO_DEPLOY_APP" --prod
}

n=1
while true; do
  echo "::group::Deploy attempt ${n}/${ATTEMPTS} (${DENO_DEPLOY_APP})"
  if deploy_once; then
    echo "::endgroup::"
    echo "Deployed ${DENO_DEPLOY_APP} on attempt ${n}."
    exit 0
  fi
  echo "::endgroup::"
  if [ "$n" -ge "$ATTEMPTS" ]; then
    echo "::error::Deploy of ${DENO_DEPLOY_APP} failed after ${n} attempt(s)."
    exit 1
  fi
  backoff=$((n * 15))
  echo "::warning::Deploy attempt ${n} failed; retrying in ${backoff}s..."
  sleep "$backoff"
  n=$((n + 1))
done
