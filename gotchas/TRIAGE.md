# TW Gotcha Memory Triage

Working list for consolidating the `tw-*` memories. Buckets:

- **CLI** – testable here via `run.sh` (filter/wikitext/transclude/parser/deserializer semantics)
- **BROWSER** – needs DOM / widget lifecycle / drag-drop / navigator → not CLI-testable; would need Playwright
- **INFRA** – server, plugin load order, file watcher, boot — needs running server or boot fixture, not a render diff
- **NOTE** – advisory only ("prefer X"), nothing falsifiable
- **STALE** – memory itself says it's fixed; candidate for deletion

Three fixtures are scaffolded as worked examples. The rest are sized so we can scaffold them in batches.

## CLI bucket (have a fixture: ✅ done, [ ] TODO)

| Slug | Status | Fixture sketch |
|------|--------|---------------|
| `tw-filter-and-vs-or` | ✅ `filter-and-vs-or` | `[X][Y]` vs `[X] [Y]` vs `[Xtag[Y]]` — three filter forms on tagged tiddlers |
| `tw-map-single-result` | ✅ `map-single-result` | `:map` vs `:map:flat` on parent→children reverse lookup |
| `tw-titlelist-format-vs-join` | ✅ `titlelist-format-vs-join` | Multi-word titles through `+[join[ ]]` vs `+[format:titlelist[]join[ ]]` |
| `tw-filter-accumulation` | ✅ `filter-accumulation` | `:filter` after two runs filters A∪B; placed between runs only filters first |
| `tw-procedure-call-passes-literal` | ✅ `procedure-call-passes-literal` | Bare arg passes literal token; inherit-no-param workaround works. **Bonus finding**: `<<proc <<var>>>>` angle-expansion breaks parser, leaks literal `</$let>` |
| `tw-textref-double-indirection` | ✅ `textref-double-indirection` | `[{X}]` returns text; `[{X}get[text]]` does double lookup, silent empty when target missing |
| `tw-transclude-thisTiddler-vs-currentTiddler` | ✅ `transclude-thisTiddler` | Confirmed: `$transclude $tiddler="X"` sets `thisTiddler=X`, `currentTiddler` stays at caller. ListWidget with `variable=` doesn't set either |
| `tw-config-tiddler-trailing-newline` | ✅ `config-tiddler-trailing-newline` | `.tid` body `X/\n` has length 2; `split` with naive operand silently returns whole string |
| `tw-filter-bare-title-regex-trap` | ✅ `filter-bare-title-regex-trap` | Confirmed: `-[a/b/c]` silently keeps `a/b/c`; `-[[a/b/c]]` and `<$let>` indirection both work |
| `tw-filter-function-explicit-args` | ✅ `filter-function-explicit-args` | **Memory partially stale (TW 5.4.0)**: in a simple `:filter[function[f]]` call, implicit `<currentTiddler>` works fine — both forms returned identical results. The original `viaTeamPersons` bug was in a compound nested-function context. Memory now scoped accordingly |
| `tw-map-subfilter-iterator-source` | ✅ `map-subfilter-iterator-source` | Confirmed: bare `has[parent]` inside `:map` returns 3 empty results; `all[tiddlers]` prefix recovers ChildA/ChildB |
| `tw-kin-filter-gotchas` | ✅ `kin-filter-gotchas` | Direction confirmed (`from`=ancestors, `to`=descendants, base included). **Memory clarification**: kin filters source against (kin-of-operand-or-source-if-empty); narrow source ∩ kin set returns empty if disjoint |
| `tw-shadow-tiddler-tags` | ✅ `shadow-tiddler-tags` | Confirmed: `[tag[$:/tags/AdvancedSearch]]` returns 0; `[all[tiddlers+shadows]tag[…]]` returns 4 |
| `tw-attr-concatenation` | ✅ `attr-concatenation` | Confirmed: `<$text text=<<v>>:suffix/>` ignores `:suffix` (renders just "Base"); filter `{{{[<v>addsuffix[:suffix]]}}}` and backtick `\`$(v)$:suffix\`` both concatenate correctly |
| `tw-textref-filter-join` | ✅ `textref-filter-join` | Confirmed: `<$let s={{{[[A]] [[B]] [[C]]}}}>` keeps only "A"; with `+[join[ ]]` keeps "A B C", enlist gives all three |
| `tw-date-format-DDD-vs-dddd` | ✅ `date-format-DDD-vs-dddd` | Confirmed: DDD=Monday (text), dddd=1 (numeric Mon=1..Sun=7); also confirmed `MM` does NOT zero-pad (Jan→`1`) |
| `tw-frontmatter-title-roundtrip` | ✅ `frontmatter-title-roundtrip` | Confirmed via rimir/frontmatter (env.sh points at dev-wiki/plugins): a `Has_Colon.md` with `title: "Has:Colon"` in YAML loads as tiddler `Has:Colon`, extra YAML fields preserved, no tiddler exists under the underscored filename |
| `tw-deserializer-not-invoked-by-addTiddler` | ✅ `deserializer-not-invoked` | Confirmed: registered tiddlerdeserializer fires on file load (via JS module + `.meta`) but NOT for `wiki.addTiddler({title,type,text})`. Routing through `wiki.deserializeTiddlers(type, text, {})` first parses kv-payload into fields. **Two side findings**: (1) JS modules in standalone wikis need `.meta` sidecar; (2) startup modules need `before:["commands"]` to run before `--render` |
| `tw-mindmap-chain-leaf-filter-source` | [ ] | Mindmap-specific — needs `rimir/mindmap` plugin loaded. Defer until mindmap is stable |
| `tw-procedure-param-scope` | ✅ `procedure-param-scope` | **Memory partially stale (TW 5.4.0)**: a `\procedure` whose body uses `<x>` inside `:filter[get[team-member-of]enlist-input[]match<x>]` returns correct results for BOTH `<<proc "T1">>` (param) and `<$let>` scope-inheritance. The original `oa-start-recurring-meeting` failure was in a more compound filter shape; memory now scoped accordingly |
| `tw-define-to-procedure` | ✅ `define-to-procedure` | Confirmed: `\define` substitutes `$x$`; `\procedure` and `\function` do NOT — `$x$` renders literally. Use `<<x>>` (procedure) or `<x>` (function) for parameter access |
| `tw-wikitext-gotchas.code-body` | ✅ `code-body` | **Memory wrong** — TW 5.4.0: `code-body: yes` does NOT disable pragma parsing. It only swaps the browser view template via the `ViewTemplateBodyFilters` cascade. Pragmas, transclusion, and `--render` all work normally on a code-body tiddler. Memory rewritten |
| `tw-wikitext-gotchas.function-single-line` | ✅ `function-single-line` | Confirmed: continuation lines leak as body text (rendered as wikilinks since `[[X]]` was the leaked line). The first body line IS the function |
| `tw-wikitext-gotchas.function-operator-nesting` | ✅ `function-operator-nesting` | Confirmed: `[function[f]]count[]` raises "Filter error: Missing [ in filter expression"; either chain inside `[function[f]count[]]` or start new run `+[count[]]` |
| `tw-wikitext-gotchas.removeprefix-drops` | ✅ `removeprefix-drops` | Confirmed: `+[removesuffix[.md]]` drops file.txt entirely; `:filter[suffix[.md]] :map[removesuffix[.md]]` is the safe guard; chained `removesuffix[.txt]removesuffix[.md]` on `a.md` drops everything because first op already removed nothing |
| `tw-wikitext-gotchas.filterTiddlers-shadows` | ✅ `filterTiddlers-shadows` | Confirmed: `$tw.wiki.filterTiddlers("[tag[$:/tags/AdvancedSearch]]")` returns 0 results; `[all[tiddlers+shadows]tag[…]]` returns 4. Pattern uses startup module (probe writes counts to a tiddler) + RunTest reads them |
| `tw-wikitext-gotchas.jsonget-map` | ✅ `jsonget-map` | Confirmed: `:map[…jsonget<idx>jsonget[name]]` returns `[][][]` (empty); workarounds: (1) `:map[…jsonextract<idx>jsonget[name]]` or (2) **multi-arg form** `:map[…jsonget<idx>,[name]]` — both return `[alice][bob][carol]`. Bonus finding: jsonindexes/jsonget operate on JSON-encoded titles, so must chain `get[text]` first |
| `tw-wikitext-gotchas.then-else-chain-nesting` | ✅ `then-else-chain-nesting` | Confirmed: three chained `:then[[A]] :then[[B]] :then[[C]]` always end as [C]; `:then` only fires when results non-empty; `:else` only when empty. **Note:** memory's pseudo-code `[A] :then[B]` requires double-brackets `[[A]] :then[[B]]` to actually work — original syntax was conceptual |
| `tw-540-migration.colon-vars` | ✅ `540-colon-vars` | Confirmed in TW 5.4.0: `<<foo:bar>>` returns empty; filter `[<foo:bar>]` still finds the value. Workaround: rename vars to hyphens, or always use filter syntax |
| `tw-540-migration.macro-output` | ✅ `540-macro-output-syslink` | Confirmed in TW 5.4.0 (text/html render): `<<v>>` where v=`$:/some/path` emits full `<a class="tc-tiddlylink…">` anchor; `<$text text=<<v>>/>` emits raw text. Fixture uses per-fixture `render-type.txt` to switch to text/html — pattern available for any other gotcha that needs HTML output |
| `feedback-tw-filters.short-circuit` | ✅ `filter-short-circuit` | Confirmed: `[<v>is[blank]then[yes-blank]enlist-input[]match[never]]` returns empty (later ops wipe `then`'s output). Workaround `~`-joined separate runs works as documented |
| `feedback-tw-filters.dotted-vars` | ✅ `dotted-vars` | **Memory wrong** in TW 5.4.0: `<$let f.status="DOTTED">` resolves correctly in `<<f.status>>`, `<$text text=<<f.status>>/>`, AND `<$list filter="[<f.status>]">`. Memory corrected to flag the original symptom was something else |
| `feedback-tw-filters.now-macro` | ✅ `now-macro` | Confirmed (deterministic via literal-only format strings): `<<now "ZZZ-PURE-LITERAL">>` → `ZZZ-PURE-LITERAL` (format chars pass through), `[now[ZZ-LITERAL]]` filter operator → empty (no such op). **Bonus finding** (dropped from final fixture for determinism): `<now>` IN A FILTER resolves to the now macro's default-formatted current time, so the memory's "wrong" claim about that syntax is partially incorrect — it does produce output, just time-varying |
| `feedback-tw-filters.subfilter-literal` | ✅ `subfilter-literal` | Confirmed: `[subfilter[tag[X]]]`, `[subfilter[[tag[X]]]]`, even `[subfilter[function[name]]]` all fail with "Filter error: Missing [ in filter expression". Indirection via `<var>`, `{Tiddler!!text}`, or trimmed `<$let>` works |
| `tw-wikitext-gotchas.comment-syntax` | ✅ `comment-syntax` (text/html) | Confirmed: `<%-- ... --%>` renders as visible literal text (HTML-escaped); `<!-- ... -->` is a real comment (stripped); `<%if%>`/`<%endif%>` works. **Bonus finding**: TW renders `--` → `–` (em-dash) in HTML output — pure typographic substitution |
| `tw-wikitext-gotchas.filter-negation` | ✅ `filter-negation` | **Memory wrong** in TW 5.4.0: `:filter[!has[mark]]` works identically to `+[!has[mark]]` — both return `[NoMark]` when run against `HasMark`+`NoMark`. Memory's "negated ops silently fail inside :filter" claim is false; possibly a misattribution of the `<currentTiddler>`-not-binding issue |
| `tw-wikitext-gotchas.get-field-empty` | ✅ `get-field-empty` | Confirmed: `get[mark]` returns no output (not `""`) for missing OR empty fields — `count[]` is 0, `addprefix[X-]` produces nothing. Tested with present, missing, and empty-string-valued fields |

## BROWSER bucket — keep as memories, would need Playwright

| Slug | Why browser |
|------|-------------|
| `tw-macrocall-block-mode` | **Reclassified → CLI** ✅ `macrocall-block-mode` (text/html). Confirmed: `$macrocall`, default `$transclude $variable`, `<<proc>>` all render INLINE — block-level wikitext like `!! Heading` and `* item` leak as literal text. Only `$transclude $variable="X" $mode="block"` properly renders block constructs (got `<h2>...</h2><ul><li>...</li></ul>`) |
| `tw-cascade-gotchas` | ViewTemplateBodyFilter ordering — needs StoryRiver / TiddlerWidget mount |
| `tw-slot-fill` | **Reclassified → CLI** ✅ `slot-fill`. **Memory wrong (TW 5.4.0)**: colons in `$slot`/`$fill` names work fine; fixture transcludes a component with `$name="view:sec"` slot, both default fallback and supplied fill resolve correctly. Memory rewritten. (Memory's #2 claim about scope nesting through procedures is a different issue and still needs separate testing.) |
| `tw-import-walker-breaks-on-nested-import` | **Reclassified → CLI** ✅ `import-walker-stops`. Confirmed: tiddler starting with `\import` then a `\procedure` definition — the procedure is silently dropped when the target tiddler is `\import`ed by another. Clean tiddlers (no leading `\import`) keep their procedures |
| `tw-statewrap-get-variable` | **Reclassified → CLI** ✅ `statewrap-get-variable` (env.sh + rimir/statewrap). Confirmed: inside `<$statewrap channels="section" default-section="MY_SECTION">`, `[statewrap-get[section]]` returns MY_SECTION directly; `[function[fnGet]]` (fake-widget body) returns empty; `[subfilter<procGet>]` (real-widget context) returns MY_SECTION |
| `tw-edit-text-rerender` | Edit-widget lifecycle, focus loss |
| `tw-statewrap-action-timing` | Action sequence timing in event handler |
| `tw-widget-html-nesting` | **Reclassified → CLI** ✅ `widget-html-nesting` (text/html). Confirmed: proper-nested `<$let>` around `<div>` renders correctly; straddling `<$let>` opening inside `<div>` and closing outside leaks `</div>` as HTML-escaped literal text in the output |
| `tw-appify-no-navigator` | Navigator message dispatch in app vs story |
| `tw-appify-permalink-workaround` | URL hash → tiddler open |
| `tw-modal-inline-navigator-eats-close` | Modal lifecycle |
| `tw-cytoscape-compound-gotchas` | Cytoscape lib runs only in browser |
| `tw-graph-boundingbox-p-wrapper` | CSS cascade |
| `tw-outlook-drag-empty-mime` | Drag & drop event |
| `tw-test-fixture-pollution` | Filesystem state across browser test runs |
| `tw-wiki-test-spec-isolation` | wiki-test-spec internals (could move under INFRA) |
| `tw-wikitext-gotchas.reveal-html-fragment` | **Reclassified → CLI** ✅ `reveal-html-fragment` (text/html). Confirmed: closing tags inside subsequent `<$reveal>` blocks render as ESCAPED literal text (`&lt;/$reveal&gt;`, `&lt;/div&gt;`, `&lt;/$let&gt;` all appear in output). The widget parser refuses to fragment HTML across reveal boundaries |
| `tw-wikitext-gotchas.p-wrapper` | **Reclassified → CLI** ✅ `p-wrapper` (via `render-type.txt=text/html`). Confirmed TW wraps inline wikitext in `<p>` and DOES wrap raw HTML `<div>` inside that `<p>` (HTML-invalid but TW does it). Blank-line break opens a new `<p>` |
| `tw-wikitext-gotchas.test-trailing-newline` | Test framework artifact |
| `tw-wikitext-gotchas.else-actions` | Action invocation only matters in widget tree |
| `tw-wikitext-gotchas.syslink-trap` | Renders as link only in HTML — *might* be CLI-detectable via text/html render |
| `llm-connect-gotchas.restricted-wiki` | Restricted wiki + tool execution |
| `feedback-tw-filters.streams-template` | Streams plugin uses ViewTemplate |

## INFRA bucket — TW server / plugin loader / file watcher

| Slug | Notes |
|------|-------|
| `tw-540-migration.routes` | Route shape `methods` array vs `method` string |
| `tw-540-migration.dmp` | **Reclassified → CLI** ✅ `540-dmp-api` (startup probe). Confirmed in TW 5.4.0: `dmp.diff_match_patch` constructor is **gone** (`new dmp.diff_match_patch()` throws "is not a constructor"); flat functions `diffMain`, `patchMake`, `matchMain` are exported and `dmp.diffMain("foo","bar")` works |
| `tw-540-perf-instantiation-order` | **Reclassified → CLI** ✅ `540-perf-instantiation` (two startup probes — `before:["load-modules"]` and `before:["startup"]`). Confirmed: before `load-modules`, `$tw.perf` is undefined; before `startup` (= after `load-modules`), `$tw.perf` is a `Performance` instance with `.log`. Plugins with `before:["startup"]` see Performance already set — too late to monkey-patch |
| `tw-hook-chain-gotcha` | **Reclassified → CLI** ✅ `hook-chain` (startup probe + `$tw.hooks.invokeHook`). Confirmed: two hooks registered, first forgets to return → second sees `undefined`, final chain result is `undefined`. Working chain (both return) → values transformed correctly through the chain |
| `tw-frontmatter-reparse` | Two-pass startup behaviour |
| `tw-server-gotchas` (3 sub-items) | Exec cwd, self-request deadlock, restricted-wiki writes |
| `tw-runner-param-quoting` | Shell injection through runner plugin |
| `tw-file-pipeline-output-path-resolve` | path.resolve strips trailing slash |
| `tw-file-pipeline-canonical-uri-template` | Template var availability |
| `python-script-self-shadow` | Python-side, not TW at all |
| `tw-wikitext-gotchas.file-extension-slash` | Filesystem sync behaviour |
| `llm-connect-gotchas.attach-document` | Tool flow, not a single render |

## NOTE bucket — pure advisory, no test possible

| Slug | Why |
|------|-----|
| `feedback-tw-filters.js-operator` | "Prefer JS filter operator" — preference |
| `llm-connect-gotchas.llm-help-tool` | Configuration policy |
| `llm-connect-gotchas.tool-category` | Configuration policy |
| `llm-connect-gotchas.chatTiddler-variable` | Documentation of a feature |
| `tw-define-to-procedure.define-deprecation` | "Never use `\define`" — policy |
| `tw-wikitext-gotchas.comment-syntax` | "Don't use `<%-- --%>`" |
| `tw-wikitext-gotchas.nested-set-let` | "Use `$let` instead of nested `$set`" |

## STALE — already fixed, candidates for deletion

| Slug | Why stale |
|------|-----------|
| `tw-file-pipeline-mime-default` | Memory itself says 0.1.10 fixed it. Keep as historical reference *or* delete. Recommend: delete; commit message has the fix details. |

## Merge candidates

These could be consolidated into single, denser memories:

1. **`tw-filter-composition`** — merge `tw-filter-and-vs-or` + `tw-filter-accumulation` + `feedback-tw-filters.short-circuit` into one filter-composition memory with sub-cases. They overlap heavily.
2. **`tw-parameter-binding`** — merge `tw-procedure-call-passes-literal` + `tw-procedure-param-scope` + `tw-filter-function-explicit-args`. All about how parameters do (or don't) bind into sub-scopes.
3. **`tw-appify-navigation`** — `tw-appify-no-navigator` + `tw-appify-permalink-workaround` + `tw-modal-inline-navigator-eats-close`. Tightly coupled "what works inside appify" set.
4. **`tw-wikitext-gotchas`** — already an omnibus, but its 18 items mix CLI/BROWSER/INFRA. Worth splitting into 3 omnibuses by bucket, so we can test the CLI ones systematically.
5. **`tw-540-migration`** — split per sub-claim (`.dmp`, `.routes`, `.colon-vars`, `.macro-output`, `.visibility`) so each can be individually tested or retired.

## Recommended next steps

1. Convert the 3 worked examples into a pattern doc others can copy from.
2. Tackle CLI bucket in batches of 5 — each batch can be ~30 min of fixture writing.
3. After all CLI fixtures pass, audit each backed memory for accuracy and shorten it (or delete it if the test makes it self-documenting).
4. For the omnibus files (`tw-wikitext-gotchas`, `tw-540-migration`), once individual fixtures exist, split the omnibus into per-claim memories that each cite their fixture.
5. Delete `tw-file-pipeline-mime-default` after one final read.
