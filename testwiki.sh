#!/bin/bash
# Run all Jasmine + wiki-based tests across all rimir plugins
# Usage: ./testwiki.sh [--seed <number>]

cd "$(dirname "$0")" || exit 1

TIDDLYWIKI_CLI_MODE=1 \
TIDDLYWIKI_PLUGIN_PATH=../dev-wiki/plugins \
npx tiddlywiki test-edition --test "$@"
