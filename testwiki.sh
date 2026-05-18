#!/bin/bash
# Run all Jasmine + wiki-based tests across all rimir plugins
# Usage: ./testwiki.sh [--seed <number>]

set -e

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
npx tiddlywiki test-edition --test "$@"
