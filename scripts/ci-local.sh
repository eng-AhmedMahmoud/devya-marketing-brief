#!/usr/bin/env bash
# Local CI for devya-marketing-brief: every stage of the GitHub quality job
# (install, lint, typecheck, build) plus the social pipeline gates:
#   - unit tests: routine helpers, screenshot guard, links/SEO, music mixing,
#     logo/theme checks (Playwright's cached Chromium + ffmpeg required), the
#     dev.to replies routine (mocked HTTP: pagination, state and dedup,
#     comment trees, drafts, the approval gate), and the YouTube track
#     (metadata and link rules, timeline and captions, the cloned-voice client
#     with mocked HTTP, word and tone checks, every slide and thumbnail through
#     the brand check, the mix);
#   - calendar quality gate with images (fails on an untagged, off-site or
#     Vercel link, off-brand accent, hashtag counts, naming, alt text), and the
#     YouTube episodes (social/youtube/episodes.json) under the same link rule;
#   - post audit (render/audit.mjs): every scheduled day passes, and the
#     caption fixes for published posts pass the same checks;
#   - live link check: every linked devya.dev page answers 200 with no redirect
#     (skip with CI_OFFLINE=1).
# Usage: scripts/ci-local.sh   (prints a summary table; exit 1 if any stage fails)

set -uo pipefail
cd "$(dirname "$0")/.."

declare -a NAMES RESULTS TIMES
FAILED=0
stage() { # name, command...
  local name="$1"; shift
  local t0=$SECONDS
  echo
  echo "=== $name: $*"
  if "$@"; then RESULTS+=("pass"); else RESULTS+=("FAIL"); FAILED=1; fi
  NAMES+=("$name"); TIMES+=("$((SECONDS - t0))s")
}

stage "install" pnpm install --frozen-lockfile
stage "lint" pnpm run lint
stage "typecheck" npx tsc --noEmit
stage "build" pnpm run build
stage "social deps" bash -c 'cd social/render && pnpm install --frozen-lockfile'
stage "tools" bash -c 'command -v ffmpeg && command -v ffprobe && command -v curl'
stage "social tests" node --test social/routine/*.test.mjs social/render/*.test.mjs social/devto/*.test.mjs social/youtube/*.test.mjs
stage "calendar gate" node social/render/validate.mjs --images
stage "post audit" bash -c 'd="$(mktemp -d)"; node social/render/audit.mjs --out "$d" && rm -rf "$d"'
if [[ "${CI_OFFLINE:-0}" == "1" ]]; then
  NAMES+=("live links"); RESULTS+=("skipped"); TIMES+=("0s")
else
  stage "live links" node social/render/validate.mjs --live
fi

echo
echo "| Stage | Result | Time |"
echo "|---|---|---|"
for i in "${!NAMES[@]}"; do echo "| ${NAMES[$i]} | ${RESULTS[$i]} | ${TIMES[$i]} |"; done
echo
echo "commit $(git rev-parse --short HEAD) · node $(node -v) · ffmpeg $(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}')"
exit "$FAILED"
