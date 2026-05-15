# TW Gotcha Fixtures — Consolidated Findings

CLI-driven regression tests for the TiddlyWiki gotcha memories. Each fixture
exercises one documented quirk against the TiddlyWiki binary at
`../../node_modules/tiddlywiki/tiddlywiki.js` (currently 5.4.0), renders the
fixture's `RunTest` tiddler, and diffs against `expected.txt`.

A failing diff means either: (a) the memory's claim about TW behaviour is
wrong / stale, or (b) TW upstream changed behaviour. Either way, the failing
fixture is the cue to update the memory or delete it.

See `README.md` for usage, `TRIAGE.md` for the per-memory worklist.

## State

**46 fixtures passing on TW 5.4.0** as of 2026-05-15.

Coverage breakdown (rough):

- ~37 fixtures cover the filter / wikitext / parser surface (the bulk).
- ~5 fixtures use startup-module probes for behaviour invisible to pure
  render (hook chain, performance instantiation timing, dmp API surface,
  filterTiddlers shadow inclusion, deserializer invocation path).
- ~3 fixtures render `text/html` to expose syslink anchors, `<p>` wrapping,
  HTML-escaping of fragmented tags.
- 1 fixture pulls in a real rimir plugin via env-var plugin path
  (`rimir/frontmatter`) and 1 more (`rimir/statewrap`).

## Memory findings (cumulative across batches)

Roughly **1 in 5 fixtures uncovers a memory claim that's wrong, stale, or
over-generalised**. Ten memory files were updated as a direct result of these
fixtures. Highlights:

### Memories that were materially wrong (TW 5.4.0)

| Memory | Claim that broke | What's actually true |
|--------|-----------------|---------------------|
| `tw-wikitext-gotchas` §2 (`code-body`) | "Pragma parsing is disabled" | `code-body: yes` only swaps the browser view template (cascade). Pragmas, transclusion, and `--render` all work normally. Only the in-browser display changes. |
| `tw-wikitext-gotchas` §9 (`:filter !` negation) | "`:filter[!has[X]]` silently fails" | `:filter[!has[mark]]` and `+[!has[mark]]` produce identical correct results. The original symptom was probably the `<currentTiddler>`-not-binding issue inside `:filter[function[…]]`. |
| `feedback-tw-filters` §dotted-vars | "Variable names with dots don't resolve" | `<<f.status>>`, `<$text text=<<f.status>>/>`, AND `<$list filter="[<f.status>]">` all resolve correctly. |
| `tw-slot-fill` §1 | "`$name='view:sec'` silently falls back to default" | Both hyphen- and colon-named slots/fills work identically; the fill is found in both cases. |

### Memories that were correct but scoped too broadly

| Memory | Scope adjustment |
|--------|------------------|
| `tw-filter-function-explicit-args` | Simple `:filter[function[f]]` calls work fine with implicit `<currentTiddler>`. The original bug was in a compound nested-function context. Memory now flags the explicit-arg convention as defensive, not absolute. |
| `tw-procedure-param-scope` | Both `<<proc "T1">>` (param) and `<$let targetTeam="T1"><<proc>></$let>` (scope-inheritance) work in the typical filter shape. The original failure was a less common operand combination (`then<varname>get[field]` chained in one run). |
| `feedback-tw-filters` §now-macro | `<<now "literal">>` and `<now>` in filter both produce output; the difference is determinism, not "wrong syntax". |

### Memories that were correct but added precision

| Memory | Precision added |
|--------|----------------|
| `tw-procedure-call-passes-literal` | Documented bonus finding: the "obvious" workaround `<<proc <<var>>>>` **breaks the parser** and leaks `</$let>` as literal text downstream. |
| `tw-kin-filter-gotchas` | Documented precise rule: empty operand `kin:parent:from[]` uses the SOURCE as the seed; named operand `kin:parent:from[X]` uses X as the seed and filters the source against the kin set. |
| `tw-date-format-DDD-vs-dddd` | Added verified-by ref + side finding that `MM` does NOT zero-pad (Jan → `1`, not `01`). |

## Reclassifications BROWSER → CLI

Eleven memories I initially tagged "BROWSER-only" turned out to be CLI-testable
once I figured out the right rendering path or probe shape:

| Memory | How it became CLI-testable |
|--------|---------------------------|
| `tw-540-migration` §macro-output (syslink trap) | `render-type.txt=text/html`; the `<a class="tc-tiddlylink…">` anchor shows up directly in the output |
| `tw-import-walker-breaks-on-nested-import` | Set `\import` at top of a target tiddler, observe its procedures don't propagate via `\import` from another tiddler |
| `tw-wikitext-gotchas` §p-wrapper | `text/html` shows `<p>` wrapping behaviour |
| `tw-slot-fill` | `<$transclude $tiddler=…>` with `<$fill>` children — visible in text/plain |
| `tw-statewrap-get-variable` | `env.sh` adds `rimir/statewrap`; `[function[…]]` (fake widget) vs `[subfilter<proc>]` (real widget context) inside `<$statewrap>` |
| `tw-macrocall-block-mode` | `text/html` shows that only `$transclude $variable=… $mode=block` renders block constructs to real `<h2>`/`<ul>`; `$macrocall` etc. leave them as literal text |
| `tw-wikitext-gotchas` §reveal-html-fragment | `text/html` exposes the closing tags as HTML-escaped literal text |
| `tw-widget-html-nesting` | Same approach — straddling `<$let>`/`<div>` boundary leaks `</div>` as escaped text |
| `tw-540-migration.dmp` | Startup probe queries the API surface (`typeof dmp.diff_match_patch === "function"` etc.) |
| `tw-540-perf-instantiation-order` | Two startup probes with `before:["load-modules"]` and `before:["startup"]` capture `$tw.perf` state at each phase |
| `tw-hook-chain-gotcha` | Startup probe registers hooks and calls `$tw.hooks.invokeHook` directly |

## Runner conventions established

The runner started simple (`run.sh` + diff against `expected.txt`) and grew
two optional per-fixture knobs as needs arose:

- `render-type.txt` — overrides the render MIME from `text/plain` (default)
  to `text/html` for fixtures that need to see HTML structure (anchors,
  `<p>` wrapping, fragmented tag escaping).
- `env.sh` — `KEY=VALUE` lines exported into the TW invocation. `$ROOT`
  expands to the runner's directory. Used by `frontmatter-title-roundtrip`
  and `statewrap-get-variable` to set `TIDDLYWIKI_PLUGIN_PATH` at
  `$ROOT/../../dev-wiki/plugins` so the fixture's `tiddlywiki.info` can list
  `rimir/<plugin>` by name without copying plugin files.

JS modules used by probes need `.meta` sidecars (because standalone tiddler
directories don't auto-detect `.js` files as modules — that's a plugin-only
shortcut). Startup probes that need to run before `--render` must declare
`exports.before = ["commands"]` (the `commands` startup module is what
processes the `--render` CLI flag; default ordering would put the probe
after that, too late).

## What's left

The remaining memories that haven't been turned into fixtures are
genuinely event-driven, environment-coupled, or specific to running
infrastructure:

- **DOM-event driven**: `tw-edit-text-rerender` (focus loss),
  `tw-statewrap-action-timing` (action sequence on event), `tw-outlook-drag-empty-mime`
  (drag event), `tw-modal-inline-navigator-eats-close` (modal lifecycle).
  Would need Playwright (already in `tw-tests/`).
- **Running-server coupled**: `tw-server-gotchas` (exec cwd, self-request
  deadlock, restricted-wiki writes), `tw-runner-param-quoting`. Would need
  to spin up the TW server in a fixture.
- **External lib coupled**: `tw-cytoscape-compound-gotchas`,
  `tw-graph-boundingbox-p-wrapper` — Cytoscape/CSS only run in a real DOM.
- **Plugin internals**: `tw-frontmatter-reparse` (frontmatter plugin's
  two-pass startup), `tw-mindmap-chain-leaf-filter-source` (mindmap leaf
  iterator). Could be written but require deeper plugin knowledge.
- **Filesystem-sync edge cases**: `tw-file-pipeline-output-path-resolve`,
  `tw-file-pipeline-canonical-uri-template`, `tw-wikitext-gotchas`
  §file-extension-slash (titles with `/` after extension).

Of these, the running-server group and the DOM-event group are the
largest unaddressed slices.

## Process notes for next pass

- **Roughly 1 in 4–5 fixtures will fail or reveal something off**.
  Plan time for memory updates after each batch.
- **Whitespace-eating around `<$list>` widgets** in `text/plain` rendering
  bit the first few fixtures. Default to single-line per assertion or wrap
  the whole assertion in `[<<v>>]` so the diff is unambiguous.
- **Time-dependent values** (current date) make tests non-deterministic.
  Either freeze the date at fixture time, use only deterministic format
  chars (e.g. `<<now "literal">>` passes through verbatim), or skip the
  claim altogether.
- **Plugin-specific gotchas** are still worth fixturing — `env.sh` is
  cheap, and a gotcha you can re-run against a plugin upgrade is a
  regression test in disguise.
