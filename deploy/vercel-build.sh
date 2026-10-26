#!/bin/sh
# Vercel build for a deploy from the repo root (Git or `vercel deploy` at the root; vercel.json there serves
# deploy/etch-app as is). The only step: point the page at a backend without committing its URL.
#   ETCH_API          the backend's URL (a Cloudflare tunnel, a container): config.json becomes {"api": "<url>"}
#   ETCH_CONFIG_URL   or a URL that serves {"api": ...} (deploy/tunnel.sh keeps one current): {"config_url": "<url>"}
# Neither set: config.json stays as committed. deploy/redeploy.sh (the CLI from deploy/etch-app) never runs this.
set -eu
CFG=deploy/etch-app/config.json
if [ -n "${ETCH_API:-}" ]; then
  printf '{"api": "%s"}\n' "${ETCH_API%/}" > "$CFG"
elif [ -n "${ETCH_CONFIG_URL:-}" ]; then
  printf '{"config_url": "%s"}\n' "$ETCH_CONFIG_URL" > "$CFG"
fi
echo "config.json: $(cat "$CFG")"
