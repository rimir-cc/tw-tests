#!/bin/bash
# Run all Jasmine + wiki-based tests across all rimir plugins
# Usage: ./testwiki.sh [spec=<filter>] [--seed <number>]
#   --seed <n>  replay the spec order of an earlier run ("Randomized with seed <n>"). TW's --test command
#               does not take a seed: it is passed as JASMINE_SEED and applied by
#               test-edition/tiddlers/test-jasmine-seed.js.

set -e

ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --seed) shift; export JASMINE_SEED="$1" ;;
    --seed=*) export JASMINE_SEED="${1#--seed=}" ;;
    *) ARGS+=("$1") ;;
  esac
  shift
done

cd "$(dirname "$0")"

# Resolve plugin path to an ABSOLUTE path. TW's loadTiddlersFromSpecification
# uses path.resolve() against the plugin directory; if the base is relative,
# every file ref inside a plugin's `test-edition/tiddlers/tiddlywiki.files`
# also resolves cwd-relatively, which puts cross-tree refs (e.g. namespace's
# `../../../../../tiddlers/_system/plugins/flibbles/relink.json`) in the wrong
# place. Making the base absolute keeps the resolution stable.
ABS_PLUGINS="$(cd ../dev-wiki/plugins && pwd)"

TIDDLYWIKI_CLI_MODE=1 \
TIDDLYWIKI_PLUGIN_PATH="$ABS_PLUGINS" \
npx tiddlywiki test-edition --test "${ARGS[@]}"
