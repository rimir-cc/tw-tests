const { test, expect } = require("@playwright/test");
const {
	waitForTW, openPalette, closePaletteIfOpen, paletteType,
	createTiddlerInBrowser,
} = require("./helpers");

/**
 * cascade-palette Phase 2 tail — the DEEP "Fork current view" loop.
 *
 * Fork makes a fully independent PERSISTED copy of the active view: its
 * ca-view-* fields PLUS a private copy of every explicit structure-layer and
 * grouping axis it references, with all titles rewritten so nothing the fork
 * references is shared with the source. Reached via Manage views → Fork
 * current view (a `keep` view-action leaf operating on the active view).
 *
 * The deep-copy internals (param preservation, byte-level isolation,
 * collision-safe titles, unresolvable-ref passthrough) are exhaustively
 * unit-tested in cp-view-editor's test-view-fork.js — this E2E drives the
 * user-facing loop end to end.
 *
 * E2E-LIMIT: an axis-chain view (e.g. shipped "By date") buckets EVERY row —
 * including the command entries — under its axes, so the command menu isn't
 * reachable at root to fire Fork. The axis-deep-copy case is therefore driven
 * through a seeded EXPLICIT-layer view that lists the (flat) entries layer
 * alongside an axis-bearing data layer, keeping the menu reachable.
 */

test.describe.configure({ mode: "serial" });

const VIEW_TAG = "$:/tags/rimir/cascade-palette/view";
const LAYER_TAG = "$:/tags/rimir/cascade-palette/structure-layer";
const AXIS_TAG = "$:/tags/rimir/cascade-palette/axis";
const AXES_NS = "$:/plugins/rimir/cascade-palette/axes/";
const LAYERS_NS = "$:/plugins/rimir/cascade-palette/structure-layers/";
const BUILTIN_ENTRIES = LAYERS_NS + "entries";

async function selectView(page, name) {
	await page.locator(".rcp-view-strip .rcp-view-pill", { hasText: name })
		.first().click();
	await page.waitForTimeout(150);
}

// Manage views → Fork current view. The manage-views row renders its ca-name
// under some views and its title path under others, so match the stable hint.
async function fork(page) {
	await paletteType(page, "Manage view");
	await page.locator(".rcp-results .rcp-row", { hasText: "fork or delete" })
		.first().click();
	await page.waitForTimeout(150);
	await page.locator(".rcp-results .rcp-row", { hasText: "Fork current view" })
		.first().click();
	await page.waitForTimeout(200);
}

function findForkViews(page) {
	return page.evaluate((tag) =>
		$tw.wiki.filterTiddlers("[all[tiddlers]tag[" + tag + "]]").filter((t) =>
			/\(copy\)\s*$/.test((($tw.wiki.getTiddler(t) || { fields: {} }).fields["ca-view-name"]) || ""))
	, VIEW_TAG);
}

// pw-edition writes created tiddlers to disk, so "(copy)" parts and seeds
// survive across runs / a crashed test. Purge them on BOTH ends so each test
// starts from a clean slate and a fork is detected by set-difference.
async function purge(page) {
	await page.evaluate(() => {
		const kill = (filter, field) =>
			$tw.wiki.filterTiddlers(filter).forEach((t) => {
				if (/\(copy\)\s*$/.test((($tw.wiki.getTiddler(t) || { fields: {} }).fields[field]) || "")) {
					$tw.wiki.deleteTiddler(t);
				}
			});
		kill("[all[tiddlers]tag[$:/tags/rimir/cascade-palette/view]]", "ca-view-name");
		kill("[all[tiddlers]prefix[$:/plugins/rimir/cascade-palette/structure-layers/]]", "ca-layer-name");
		kill("[all[tiddlers]prefix[$:/plugins/rimir/cascade-palette/axes/]]", "ca-axis-name");
		[
			"$:/test/zfork/view", "$:/test/zfork/layer", "$:/test/zfork/axis", "ZForkData1",
		].forEach((t) => $tw.wiki.deleteTiddler(t));
	});
}

test.describe("cascade-palette fork view", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
		await purge(page);
	});

	test.afterEach(async ({ page }) => {
		await closePaletteIfOpen(page);
		await purge(page);
	});

	test("forking an explicit-layer view deep-copies its layers, switching to the copy", async ({ page }) => {
		await openPalette(page);
		const before = await findForkViews(page);
		await selectView(page, "Hybrid"); // ca-view-layers = tag-tree path-tree (+ entries)
		await fork(page);

		const fresh = (await findForkViews(page)).filter((t) => !before.includes(t));
		expect(fresh.length).toBe(1);

		const out = await page.evaluate((forkTitle) => {
			const refs = ($tw.wiki.getTiddler(forkTitle).fields["ca-view-layers"] || "")
				.trim().split(/\s+/);
			return {
				refs,
				shippedIntact:
					$tw.wiki.isShadowTiddler("$:/plugins/rimir/cascade-palette/structure-layers/tag-tree") &&
					$tw.wiki.isShadowTiddler("$:/plugins/rimir/cascade-palette/structure-layers/path-tree"),
			};
		}, fresh[0]);

		// Two explicit layers copied into private titles; the entries layer (if
		// present) passes through verbatim. No ref points at a shipped layer.
		const dataRefs = out.refs.filter((r) => r !== BUILTIN_ENTRIES);
		expect(dataRefs.length).toBe(2);
		for (const r of dataRefs) {
			expect(r.startsWith(LAYERS_NS)).toBe(true);
			expect(r).not.toBe(LAYERS_NS + "tag-tree");
			expect(r).not.toBe(LAYERS_NS + "path-tree");
		}
		expect(out.shippedIntact).toBe(true); // originals untouched
	});

	test("forking deep-copies an axis-bearing layer's chain + passes the entries layer through", async ({ page }) => {
		// Seed an explicit-layer view: a flat entries layer (keeps the command
		// menu reachable at root) + a data layer carrying an axis chain.
		await createTiddlerInBrowser(page, "$:/test/zfork/axis", {
			tags: [AXIS_TAG], type: "text/vnd.tiddlywiki",
			"ca-axis-name": "ZForkAxis", "ca-axis-key": "[get[zk]]", "ca-axis-sort": "asc",
		});
		await createTiddlerInBrowser(page, "$:/test/zfork/layer", {
			tags: [LAYER_TAG], type: "text/vnd.tiddlywiki",
			"ca-layer-name": "ZForkLayer", "ca-layer-roots": "[tag[ZForkTag]]",
			"ca-layer-axes": "$:/test/zfork/axis",
		});
		await createTiddlerInBrowser(page, "$:/test/zfork/view", {
			tags: [VIEW_TAG], type: "text/vnd.tiddlywiki",
			"ca-view-name": "ZForkView",
			"ca-view-layers": BUILTIN_ENTRIES + " $:/test/zfork/layer",
		});
		await createTiddlerInBrowser(page, "ZForkData1", { tags: ["ZForkTag"], zk: "alpha", text: "x" });

		await openPalette(page);
		const before = await findForkViews(page);
		await selectView(page, "ZForkView");
		await fork(page);

		const fresh = (await findForkViews(page)).filter((t) => !before.includes(t));
		expect(fresh.length).toBe(1);

		const out = await page.evaluate((forkTitle) => {
			const refs = ($tw.wiki.getTiddler(forkTitle).fields["ca-view-layers"] || "")
				.trim().split(/\s+/);
			const dataRef = refs.find((r) => r !== "$:/plugins/rimir/cascade-palette/structure-layers/entries");
			const axisRef = dataRef
				? ($tw.wiki.getTiddler(dataRef).fields["ca-layer-axes"] || "").trim()
				: "";
			return {
				entriesRef: refs[0],
				dataRef,
				axisRef,
				origLayerIntact: ($tw.wiki.getTiddler("$:/test/zfork/layer").fields["ca-layer-axes"]) === "$:/test/zfork/axis",
				origAxisIntact: ($tw.wiki.getTiddler("$:/test/zfork/axis").fields["ca-axis-key"]) === "[get[zk]]",
			};
		}, fresh[0]);

		// Built-in entries layer passed through verbatim.
		expect(out.entriesRef).toBe(BUILTIN_ENTRIES);
		// Data layer copied to a private title; its axis chain rewritten to a
		// private axis (neither equal to the seeded source).
		expect(out.dataRef.startsWith(LAYERS_NS)).toBe(true);
		expect(out.dataRef).not.toBe("$:/test/zfork/layer");
		expect(out.axisRef.startsWith(AXES_NS)).toBe(true);
		expect(out.axisRef).not.toBe("$:/test/zfork/axis");
		// Sources untouched (isolation).
		expect(out.origLayerIntact).toBe(true);
		expect(out.origAxisIntact).toBe(true);
	});
});
