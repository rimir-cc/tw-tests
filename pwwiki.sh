#!/bin/bash
# Run Playwright browser tests for rimir plugins
# Usage:
#   ./pwwiki.sh                     # headless (default)
#   ./pwwiki.sh --headed             # visible browser
#   ./pwwiki.sh --headed minver      # visible, single plugin
#   ./pwwiki.sh minver               # headless, single plugin

set -e

HEADED=""
SPEC=""

for arg in "$@"; do
  case "$arg" in
    --headed) HEADED="--headed" ;;
    *) SPEC="tests/e2e/${arg}.spec.js" ;;
  esac
done

CMD="npx playwright test $HEADED"
if [ -n "$SPEC" ]; then
  CMD="$CMD $SPEC"
fi

echo "Running: $CMD"
$CMD
