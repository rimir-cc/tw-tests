#!/usr/bin/env bash
# tw-tests/gotchas/run.sh
#
# Render each fixture's RunTest tiddler via the TW CLI and diff against expected.txt.
# Usage:
#   ./run.sh                 # run all fixtures
#   ./run.sh <slug> [<slug>...]   # run named fixtures only
#   UPDATE=1 ./run.sh ...    # overwrite expected.txt with actual output (use to bootstrap a new fixture)

set -u
set -o pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
FIXTURES_DIR="$ROOT/fixtures"
TMP_DIR="$ROOT/.tmp"
TW_JS="$ROOT/../../node_modules/tiddlywiki/tiddlywiki.js"

if [[ ! -f "$TW_JS" ]]; then
    echo "ERROR: tiddlywiki.js not found at $TW_JS" >&2
    exit 2
fi

TW_VERSION=$(node "$TW_JS" --version 2>/dev/null | head -1)
echo "TiddlyWiki $TW_VERSION"
echo

mkdir -p "$TMP_DIR"

if [[ $# -gt 0 ]]; then
    SELECTED=("$@")
else
    SELECTED=()
    for d in "$FIXTURES_DIR"/*/; do
        SELECTED+=("$(basename "$d")")
    done
fi

PASS=0
FAIL=0
FAILED_NAMES=()

for name in "${SELECTED[@]}"; do
    fix="$FIXTURES_DIR/$name"
    if [[ ! -d "$fix" ]]; then
        echo "SKIP $name (no such fixture)"
        continue
    fi

    out_dir="$TMP_DIR/$name"
    rm -rf "$out_dir"
    mkdir -p "$out_dir"

    render_type="text/plain"
    if [[ -f "$fix/render-type.txt" ]]; then
        render_type=$(tr -d '[:space:]' < "$fix/render-type.txt")
    fi

    extra_env=()
    if [[ -f "$fix/env.sh" ]]; then
        # env.sh contains lines like `KEY=VALUE`; values may reference $ROOT
        while IFS='=' read -r k v; do
            [[ -z "$k" || "$k" =~ ^# ]] && continue
            v=$(eval echo "\"$v\"")
            extra_env+=("$k=$v")
        done < "$fix/env.sh"
    fi

    log="$out_dir/tw.log"
    if ! env "${extra_env[@]}" node "$TW_JS" "$fix" \
            --output "$out_dir" \
            --render RunTest output.txt "$render_type" \
            >"$log" 2>&1; then
        echo "ERROR $name (tiddlywiki invocation failed; see $log)"
        FAIL=$((FAIL + 1))
        FAILED_NAMES+=("$name")
        continue
    fi

    actual="$out_dir/output.txt"
    expected="$fix/expected.txt"

    if [[ "${UPDATE:-}" == "1" ]]; then
        cp "$actual" "$expected"
        echo "WROTE $name (expected.txt updated)"
        continue
    fi

    if [[ ! -f "$expected" ]]; then
        echo "MISSING $name (no expected.txt; run with UPDATE=1 to bootstrap)"
        echo "        actual: $actual"
        FAIL=$((FAIL + 1))
        FAILED_NAMES+=("$name")
        continue
    fi

    if diff -q "$expected" "$actual" >/dev/null; then
        echo "PASS $name"
        PASS=$((PASS + 1))
    else
        echo "FAIL $name"
        diff -u "$expected" "$actual" | sed 's/^/        /' | head -40
        FAIL=$((FAIL + 1))
        FAILED_NAMES+=("$name")
    fi
done

echo
echo "Summary: $PASS passed, $FAIL failed"
if [[ $FAIL -gt 0 ]]; then
    echo "Failed: ${FAILED_NAMES[*]}"
    exit 1
fi
