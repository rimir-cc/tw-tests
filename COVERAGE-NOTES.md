# Coverage notes

## What `bin/tw coverage` does

Implements Strategy A: instrument-before-load.

1. `bin/instrument-plugins.js` mirrors `dev-wiki/plugins/rimir/` →
   `.coverage-instrumented/dev-wiki/plugins/rimir/`. Each `.js` file is split
   into TW header (`/*\ ... \*/`) + body; the body is instrumented via
   `istanbul-lib-instrument`, then recombined so TW field-parsing still works.
   The original file path is embedded so the report maps back to source.
   `test/`, `test-edition/`, `node_modules/`, `dist/`, `.git/`, `.github/` are
   copied verbatim. A symlink `.coverage-instrumented/dev-wiki/tiddlers` → real
   `dev-wiki/tiddlers/` is created so plugins that reference data outside their
   own tree (e.g. namespace's test-edition references the relink JSON) still
   resolve.

2. `bin/coverage-hook.js` is preloaded via `node --require`. It does two
   things:
   - Monkey-patches `vm.createContext` so any sandbox TW creates shares one
     `__coverage__` reference with the parent process. TW uses
     `vm.runInContext()` to execute plugin modules (`node_modules/tiddlywiki/boot/boot.js:629`);
     without this shim, instrumented code's `__coverage__` writes land on the
     sandbox's globals and never leave.
   - Registers `process.on('exit', dumpCoverage)` to write the merged
     `__coverage__` to `.nyc_output/coverage-<pid>.json`.

3. `bin/tw coverage` cleans previous artifacts, runs the instrumenter, executes
   the umbrella Jasmine suite with the instrumented `TIDDLYWIKI_PLUGIN_PATH`
   and the hook preloaded, then `nyc report` renders `coverage/index.html`.

## Current snapshot (2026-05-16)

```
Statements   : 41.77% ( 5369/12852 )
Branches     : 34.9%  ( 2798/8016 )
Functions    : 40.99% ( 537/1310 )
Lines        : 42.43% ( 4824/11368 )
```

22 of 38 plugins appear in the report. The other 16 are either:

- **Wikitext / data only** (no JS to instrument) — capture, components,
  core-hook, doc-template, explide, external-llm-help, llm-help, msg-import,
  orga-data-model, priv-app, private-data-model.
- **Not loaded by `tw-tests/test-edition/tiddlywiki.info`** so their JS is
  instrumented on disk but never executed at runtime — file-pipeline,
  mgm-tender, present, scattered-binaries, cytoscape-engine. Adding them to
  test-edition will surface their numbers.

## Caveats

- Playwright (browser-side) coverage is not yet wired. Possible next step:
  `page.coverage.startJSCoverage()` in tests + `v8-to-istanbul` to convert,
  then merge with `.nyc_output/` before reporting.
- The `--test` mode runs Jasmine specs only; coverage of code paths that
  require a real `--listen` server (request handlers, route lifecycles) won't
  fire from Jasmine alone. Playwright E2E coverage would close this gap.
- Coverage of code instrumented but never executed shows as 0%. For some
  plugins (e.g. mgm-tender) this is expected until tests exist; for others
  (e.g. file-pipeline) it indicates a test-edition gap worth filling.

## Performance

Instrumented umbrella run is ~7.5s vs ~5s un-instrumented. Mirror tree is ~40MB
(vs ~30MB source). Gitignored. Re-runnable: `bin/tw coverage` cleans
`.coverage-instrumented/` and `.nyc_output/` each time.
