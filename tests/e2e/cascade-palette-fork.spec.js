const { test, expect } = require("@playwright/test");
const {
	waitForTW, openPalette, closePaletteIfOpen, paletteType,
	createTiddlerInBrowser,
} = require("./helpers");

/**
 * cascade-palette Phase 2 tail — the DEEP "Fork current view" loop.
 *
 * Fork makes a fully independent PERSISTED copy of the active view: its
 * ca-view-* fields PLUS a private copy of every explicit channel and
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
 * through a seeded EXPLICIT-channel view that lists the (flat) entries channel
 * alongside an axis-bearing data channel, keeping the menu reachable.
 */

test.describe.configure({ mode: "serial" });

const VIEW_TAG = "$:/tags/rimir/cascade-palette/view";
const CHANNEL_TAG = "$:/tags/rimir/cascade-palette/channel";
const AXIS_TAG = "$:/tags/rimir/cascade-palette/axis";
const AXES_NS = "$:/plugins/rimir/cascade-palette/axes/";
const CHANNELS_NS = "$:/plugins/rimir/cascade-palette/channels/";
const BUILTIN_ENTRIES = CHANNELS_NS + "entries";

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
		kill("[all[tiddlers]prefix[$:/plugins/rimir/cascade-palette/channels/]]", "ca-channel-name");
		kill("[all[tiddlers]prefix[$:/plugins/rimir/cascade-palette/axes/]]", "ca-axis-name");
		[
			"$:/test/zfork/view", "$:/test/zfork/channel", "$:/test/zfork/axis", "ZForkData1",
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

	test("forking an explicit-channel view deep-copies its channels, switching to the copy", async ({ page }) => {
		await openPalette(page);
		const before = await findForkViews(page);
		await selectView(page, "Hybrid"); // ca-view-channels = tag-tree path-tree (+ entries)
		await fork(page);

		const fresh = (await findForkViews(page)).filter((t) => !before.includes(t));
		expect(fresh.length).toBe(1);

		const out = await page.evaluate((forkTitle) => {
			const refs = ($tw.wiki.getTiddler(forkTitle).fields["ca-view-channels"] || "")
				.trim().split(/\s+/);
			return {
				refs,
				shippedIntact:
					$tw.wiki.isShadowTiddler("$:/plugins/rimir/cascade-palette/channels/tag-tree") &&
					$tw.wiki.isShadowTiddler("$:/plugins/rimir/cascade-palette/channels/path-tree"),
			};
		}, fresh[0]);

		// Two explicit channels copied into private titles; the entries channel (if
		// present) passes through verbatim. No ref points at a shipped channel.
		const dataRefs = out.refs.filter((r) => r !== BUILTIN_ENTRIES);
		expect(dataRefs.length).toBe(2);
		for (const r of dataRefs) {
			expect(r.startsWith(CHANNELS_NS)).toBe(true);
			expect(r).not.toBe(CHANNELS_NS + "tag-tree");
			expect(r).not.toBe(CHANNELS_NS + "path-tree");
		}
		expect(out.shippedIntact).toBe(true); // originals untouched
	});

	test("forking deep-copies an axis-bearing channel's chain + passes the entries channel through", async ({ page }) => {
		// Seed an explicit-channel view: a flat entries channel (keeps the command
		// menu reachable at root) + a data channel carrying an axis chain.
		await createTiddlerInBrowser(page, "$:/test/zfork/axis", {
			tags: [AXIS_TAG], type: "text/vnd.tiddlywiki",
			"ca-axis-name": "ZForkAxis", "ca-axis-key": "[get[zk]]", "ca-axis-sort": "asc",
		});
		await createTiddlerInBrowser(page, "$:/test/zfork/channel", {
			tags: [CHANNEL_TAG], type: "text/vnd.tiddlywiki",
			"ca-channel-name": "ZForkChannel", "ca-channel-roots": "[tag[ZForkTag]]",
			"ca-channel-axes": "$:/test/zfork/axis",
		});
		await createTiddlerInBrowser(page, "$:/test/zfork/view", {
			tags: [VIEW_TAG], type: "text/vnd.tiddlywiki",
			"ca-view-name": "ZForkView",
			"ca-view-channels": BUILTIN_ENTRIES + " $:/test/zfork/channel",
		});
		await createTiddlerInBrowser(page, "ZForkData1", { tags: ["ZForkTag"], zk: "alpha", text: "x" });

		await openPalette(page);
		const before = await findForkViews(page);
		await selectView(page, "ZForkView");
		await fork(page);

		const fresh = (await findForkViews(page)).filter((t) => !before.includes(t));
		expect(fresh.length).toBe(1);

		const out = await page.evaluate((forkTitle) => {
			const refs = ($tw.wiki.getTiddler(forkTitle).fields["ca-view-channels"] || "")
				.trim().split(/\s+/);
			const dataRef = refs.find((r) => r !== "$:/plugins/rimir/cascade-palette/channels/entries");
			const axisRef = dataRef
				? ($tw.wiki.getTiddler(dataRef).fields["ca-channel-axes"] || "").trim()
				: "";
			return {
				entriesRef: refs[0],
				dataRef,
				axisRef,
				origChannelIntact: ($tw.wiki.getTiddler("$:/test/zfork/channel").fields["ca-channel-axes"]) === "$:/test/zfork/axis",
				origAxisIntact: ($tw.wiki.getTiddler("$:/test/zfork/axis").fields["ca-axis-key"]) === "[get[zk]]",
			};
		}, fresh[0]);

		// Built-in entries channel passed through verbatim.
		expect(out.entriesRef).toBe(BUILTIN_ENTRIES);
		// Data channel copied to a private title; its axis chain rewritten to a
		// private axis (neither equal to the seeded source).
		expect(out.dataRef.startsWith(CHANNELS_NS)).toBe(true);
		expect(out.dataRef).not.toBe("$:/test/zfork/channel");
		expect(out.axisRef.startsWith(AXES_NS)).toBe(true);
		expect(out.axisRef).not.toBe("$:/test/zfork/axis");
		// Sources untouched (isolation).
		expect(out.origChannelIntact).toBe(true);
		expect(out.origAxisIntact).toBe(true);
	});
});
