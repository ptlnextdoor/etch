#!/bin/sh
# Vercel build for a deploy from the repo root (Git or `vercel deploy` at the root; vercel.json there serves
# deploy/etch-app as is). The only step: point the page at a backend without committing its URL.
#   ETCH_API          the backend's URL (a Cloudflare tunnel, a container): config.json becomes {"api": "<url>"}
#   ETCH_CONFIG_URL   or a URL that serves {"api": ...} (deploy/tunnel.sh keeps one current): {"config_url": "<url>"}
# Neither set: the backend the live site points at now is kept (its production config.json, read over HTTPS), so a
# new deploy of the code never moves the site off its backend; a project with no live site gets the committed one.
# deploy/redeploy.sh (the CLI from deploy/etch-app) never runs this.
set -eu
CFG=deploy/etch-app/config.json
if [ -n "${ETCH_API:-}" ]; then
  printf '{"api": "%s"}\n' "${ETCH_API%/}" > "$CFG"
elif [ -n "${ETCH_CONFIG_URL:-}" ]; then
  printf '{"config_url": "%s"}\n' "$ETCH_CONFIG_URL" > "$CFG"
elif [ -n "${VERCEL_PROJECT_PRODUCTION_URL:-}" ]; then
  LIVE=$(curl -fsS --max-time 10 "https://${VERCEL_PROJECT_PRODUCTION_URL}/config.json" 2>/dev/null || true)
  # only a small JSON object naming a backend: anything else (a login page, an error) leaves the committed file
  if [ "${#LIVE}" -lt 600 ] && printf '%s' "$LIVE" | grep -Eq '^[[:space:]]*\{[[:space:]]*"(api|config_url)"[[:space:]]*:[[:space:]]*"https://[^"<>]+"[[:space:]]*\}[[:space:]]*$'; then
    printf '%s\n' "$LIVE" > "$CFG"
    echo "kept the live site's backend"
  fi
fi
echo "config.json: $(cat "$CFG")"
