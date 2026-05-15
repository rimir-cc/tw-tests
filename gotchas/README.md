# tw-tests/gotchas

CLI-driven regression tests for the TiddlyWiki *gotchas* recorded in `~/.claude/projects/.../memory/`.

Each fixture is a tiny standalone wiki that exercises one documented quirk
(filter operator semantics, wikitext parsing, transclusion context, etc.).
The runner renders a known tiddler (`RunTest`) to `text/plain` and diffs against
`expected.txt`. A failing diff means either:

1. The memory's claim about TW behaviour is wrong / out of date, **or**
2. TW upstream changed the behaviour (e.g. a 5.4.x release fixed it).

Either way the test surfacing the failure is the prompt to either update the
memory or delete it.

## Running

```sh
./run.sh                # all fixtures
./run.sh filter-and-vs-or   # one fixture
```

Uses the TW install at `../../node_modules/tiddlywiki/tiddlywiki.js`.
Current TW version is auto-detected and printed in the summary.

## Layout

```
fixtures/<gotcha-slug>/
    tiddlywiki.info       # minimal — no rimir plugins unless gotcha needs one
    tiddlers/
        RunTest.tid       # rendered to text/plain; output diffed
        *.tid             # whatever fixture data the test needs
    expected.txt          # exact expected render output (trailing newline included)
    notes.md              # optional: link to memory slug, why the test is shaped this way
```

`RunTest.tid` is the conventional entry point. The fixture's tiddlywiki.info
includes no rimir plugins by default; only add what the gotcha specifically
needs (e.g. `rimir/frontmatter` for the frontmatter roundtrip test).

## Convention: contrast in one render

Where it's clarifying, `RunTest` renders **both** the "wrong-intuition" form
and the "correct" form, on separate lines, so the diff document *itself*
demonstrates the gotcha:

```
chain (AND): Both
runs (OR): AOnly Both BOnly
```

If TW upstream ever changes either line's output, the test fails loud.
