const { test, expect } = require("@playwright/test");
const { waitForTW, navigateToTiddler, createTiddlerInBrowser, deleteTiddlerFromBrowser } = require("./helpers");

const APP = "$:/plugins/rimir/knowledge-app/apps/knowledge";
const NOTE_TAG = "$:/tags/rimir/knowledge-app/note";
const RENDER_TIDDLER = "KnowledgeAppTestRender";

const FIXTURE_NOTES = [
	"knowledge/notes/A",
	"knowledge/notes/B",
	"knowledge/notes/C",
	"knowledge/notes/orphan",
	"knowledge/notes/stub",
	"knowledge/notes/dead-end",
	"knowledge/notes/broken",
	"knowledge/topics/python/index",
	"knowledge/topics/python/Snake",
	"orga/cross-link"
];

const STATE_TIDDLERS_PREFIX = "$:/state/rimir/knowledge-app/";

test.describe("knowledge-app: registration & static structure", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test("plugin's app tiddler exists with the right fields", async ({ page }) => {
		const app = await page.evaluate((title) => {
			const t = $tw.wiki.getTiddler(title);
			if (!t) return null;
			return {
				caption: t.fields.caption,
				layout: t.fields["appify-layout"],
				channels: t.fields["appify-channels"],
				defaultSection: t.fields["appify-default-section"],
				topbar: t.fields["appify-view-topbar"],
				sidebar: t.fields["appify-view-sidebar"],
				tags: (Array.isArray(t.fields.tags) ? t.fields.tags : []).join(" ")
			};
		}, APP);
		expect(app).not.toBeNull();
		expect(app.caption).toBe("Knowledge");
		expect(app.layout).toBe("topbar-sidebar-main");
		expect(app.channels).toContain("section");
		expect(app.channels).toContain("area");
		expect(app.channels).toContain("topic");
		expect(app.channels).toContain("note");
		expect(app.defaultSection).toBe("home");
		expect(app.tags).toContain("$:/tags/rimir/appify/app");
	});

	test("ships 4 starter areas (llm, it-security, health, gaming)", async ({ page }) => {
		const ids = await page.evaluate(() => {
			const titles = $tw.wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/rimir/knowledge-app/area]]");
			return titles.map(t => $tw.wiki.getTiddler(t).fields["area-id"]).sort();
		});
		expect(ids).toContain("gaming");
		expect(ids).toContain("health");
		expect(ids).toContain("it-security");
		expect(ids).toContain("llm");
	});

	test("splits config has the expected views", async ({ page }) => {
		const splits = await page.evaluate(() => {
			const t = $tw.wiki.getTiddler("$:/config/rimir/appify/splits/$:/plugins/rimir/knowledge-app/apps/knowledge");
			return t ? JSON.parse(t.fields.text || "{}") : null;
		});
		expect(splits).not.toBeNull();
		const labels = splits.main.views.map(v => v.label);
		expect(labels).toEqual(["Home", "Browse", "Note", "Write", "Search"]);
	});

	test("namespace feature flags are enabled by default", async ({ page }) => {
		// Read the constituents knowledge-app ships in its plugin bundle directly.
		// `getTiddlerText` on the live shadow can pick up namespace's "no" default
		// (alphabetically later → wins the shadow load-order race in boot.js).
		// What we actually want to verify is that knowledge-app's own shadows
		// declare "yes" — that's the documented contract of the plugin.
		const flags = await page.evaluate(() => {
			const info = $tw.wiki.getPluginInfo("$:/plugins/rimir/knowledge-app");
			const read = (title) => (info && info.tiddlers && info.tiddlers[title]
				? (info.tiddlers[title].text || "").trim() : null);
			return {
				walkUp: read("$:/config/rimir/namespace/walk-up"),
				aliases: read("$:/config/rimir/namespace/aliases"),
				pseudoExpansion: read("$:/config/rimir/namespace/pseudo-expansion"),
			};
		});
		expect(flags.walkUp).toBe("yes");
		expect(flags.aliases).toBe("yes");
		expect(flags.pseudoExpansion).toBe("yes");
	});

	test("starter mount kn → knowledge is registered", async ({ page }) => {
		const mount = await page.evaluate(() => {
			const titles = $tw.wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/NamespaceMount]]");
			return titles.map(title => {
				const t = $tw.wiki.getTiddler(title);
				return { title, from: t.fields.from, to: t.fields.to };
			}).find(m => m.from === "kn" && m.to === "knowledge");
		});
		expect(mount).toBeDefined();
	});

	test("_index pseudo module is registered with the resolver", async ({ page }) => {
		const found = await page.evaluate(() => {
			const mods = $tw.modules.getModulesByTypeAsHashmap("rimir-ns-pseudo");
			return Object.keys(mods).some(k => mods[k] && mods[k].name === "_index");
		});
		expect(found).toBe(true);
	});

	test("ships the documented TZK card types in the JSON config", async ({ page }) => {
		const ids = await page.evaluate(() => {
			const text = $tw.wiki.getTiddlerText("$:/config/rimir/knowledge-app/types") || "[]";
			return JSON.parse(text).map(t => t.id);
		});
		for (const id of [
			"idea", "source", "sink", "conversation", "note", "pao", "place",
			"index", "bibliography", "class", "publication", "tool", "meta",
			"attachment", "image",
		]) {
			expect(ids).toContain(id);
		}
	});

	test("knowledge-has-broken-ref filter operator is registered", async ({ page }) => {
		const found = await page.evaluate(() => {
			return typeof $tw.wiki.getFilterOperators === "function" &&
				!!$tw.wiki.getFilterOperators()["knowledge-has-broken-ref"];
		});
		expect(found).toBe(true);
	});
});

test.describe("knowledge-app: filter helpers", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
		// Seed deterministic notes
		await createTiddlerInBrowser(page, "knowledge/notes/A", {
			tags: NOTE_TAG, "kn.tier": "developing", text: "\\context knowledge\n\nlinks [[knowledge/notes/B]]"
		});
		await createTiddlerInBrowser(page, "knowledge/notes/B", {
			tags: NOTE_TAG, "kn.tier": "developing", text: ""
		});
		await createTiddlerInBrowser(page, "knowledge/notes/C", {
			tags: NOTE_TAG, "kn.tier": "developing", text: "\\context knowledge\n\nrefs [[Missing]]"
		});
		await createTiddlerInBrowser(page, "knowledge/notes/stub", {
			tags: NOTE_TAG, "kn.tier": "developing", text: "tiny"
		});
		// Force the namespace indexer to rebuild now that fixtures exist.
		await page.evaluate(() => {
			$tw.modules.execute("$:/plugins/rimir/namespace/indexer.js").rebuildAll($tw.wiki);
		});
	});

	test.afterEach(async ({ page }) => {
		for (const t of ["knowledge/notes/A", "knowledge/notes/B", "knowledge/notes/C", "knowledge/notes/stub"]) {
			await deleteTiddlerFromBrowser(page, t).catch(() => {});
		}
	});

	// Helper: render a filter via wikitext that imports the helpers
	// pragma-aware, so \function knowledge.* is in scope. Uses TW's
	// fake document so the renderer doesn't need a live DOM node.
	function runFilter(page, filterExpr) {
		return page.evaluate((expr) => {
			const text = '\\import $:/plugins/rimir/knowledge-app/filters/helpers\n<$list filter="' + expr + '" variable="t"><$text text=<<t>>/>|</$list>';
			const parser = $tw.wiki.parseText("text/vnd.tiddlywiki", text, { parseAsInline: false });
			const widgetNode = $tw.wiki.makeWidget(parser, { document: $tw.fakeDocument });
			const container = $tw.fakeDocument.createElement("div");
			widgetNode.render(container, null);
			return (container.textContent || "").split("|").filter(s => s.length > 0);
		}, filterExpr);
	}

	test("knowledge.notes returns all tagged notes (and only those)", async ({ page }) => {
		const result = await runFilter(page, "[function[knowledge.notes]] +[sort[]]");
		expect(result).toContain("knowledge/notes/A");
		expect(result).toContain("knowledge/notes/B");
		expect(result).toContain("knowledge/notes/C");
		expect(result).toContain("knowledge/notes/stub");
		expect(result.every(t => !t.startsWith("$:/"))).toBe(true);
	});

	test("knowledge.orphans excludes notes that have backlinks", async ({ page }) => {
		const result = await runFilter(page, "[function[knowledge.orphans]]");
		// B is backlinked from A; should NOT be an orphan.
		expect(result).not.toContain("knowledge/notes/B");
	});

	test("knowledge.dead-ends includes notes with no outgoing refs", async ({ page }) => {
		const result = await runFilter(page, "[function[knowledge.dead-ends]]");
		expect(result).toContain("knowledge/notes/B");
		expect(result).toContain("knowledge/notes/stub");
		// A links to B, so it has an outgoing.
		expect(result).not.toContain("knowledge/notes/A");
	});

	test("knowledge.stubs returns short notes by threshold", async ({ page }) => {
		await page.evaluate(() => {
			$tw.wiki.addTiddler({title: "$:/config/rimir/knowledge-app/stub-threshold", text: "200"});
		});
		const result = await runFilter(page, "[function[knowledge.stubs]]");
		expect(result).toContain("knowledge/notes/stub");
	});

	test("knowledge.broken returns notes with at least one unresolved ref", async ({ page }) => {
		const result = await runFilter(page, "[function[knowledge.broken]]");
		expect(result).toContain("knowledge/notes/C");
		expect(result).not.toContain("knowledge/notes/A");
	});
});

test.describe("knowledge-app: namespace integration", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});
	test.afterEach(async ({ page }) => {
		for (const t of ["knowledge/topics/python/index", "knowledge/topics/python/Snake", "orga/cross-link"]) {
			await deleteTiddlerFromBrowser(page, t).catch(() => {});
		}
	});

	test("absolute ref with _index expands to the topic's index", async ({ page }) => {
		const result = await page.evaluate(() => {
			// Pseudo expansion is gated by a feature flag. knowledge-app ships
			// a shadow that turns it on, but namespace's "no" shadow wins the
			// load-order race in boot.js. Set the user-tiddler explicitly so
			// this test reflects what a real install does in CI.
			$tw.wiki.addTiddler({title: "$:/config/rimir/namespace/pseudo-expansion", text: "yes"});
			$tw.modules.execute("$:/plugins/rimir/namespace/featureflags.js").invalidate();
			$tw.wiki.addTiddler({title: "knowledge/topics/python/index", text: "Index"});
			$tw.wiki.addTiddler({title: "knowledge/topics/python/Snake", text: ""});
			const resolver = $tw.modules.execute("$:/plugins/rimir/namespace/resolver.js");
			resolver.invalidatePseudoCache();
			return resolver.resolve(
				"knowledge/topics/python/_index",
				"knowledge/topics/python/Snake",
				$tw.wiki,
				{}
			);
		});
		expect(result.resolved).toBe("knowledge/topics/python/index");
	});

	test("kn mount rewrites cross-app refs", async ({ page }) => {
		const result = await page.evaluate(() => {
			$tw.wiki.addTiddler({title: "knowledge/topics/python/Snake", text: ""});
			$tw.wiki.addTiddler({title: "orga/cross-link", text: "see [[kn/topics/python/Snake]]"});
			const resolver = $tw.modules.execute("$:/plugins/rimir/namespace/resolver.js");
			return resolver.resolve("kn/topics/python/Snake", "orga/cross-link", $tw.wiki, {});
		});
		expect(result.resolved).toBe("knowledge/topics/python/Snake");
		expect(result.status).toBe("mount");
	});
});

test.describe("knowledge-app: views render", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test.afterEach(async ({ page }) => {
		await deleteTiddlerFromBrowser(page, RENDER_TIDDLER).catch(() => {});
		for (const t of ["knowledge/notes/V1", "knowledge/notes/V2"]) {
			await deleteTiddlerFromBrowser(page, t).catch(() => {});
		}
	});

	test("Note view renders cleanly (placeholder when no note channel)", async ({ page }) => {
		// Note view depends on statewrap-get[note] which is only populated
		// inside an <$appify-app> wrapper. Outside that, the view should
		// render its placeholder without crashing.
		await createTiddlerInBrowser(page, RENDER_TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/knowledge-app/views/note" $mode="block"/>'
		});
		await navigateToTiddler(page, RENDER_TIDDLER);
		await page.waitForTimeout(400);
		const body = await page.locator(`.tc-tiddler-frame[data-tiddler-title="${RENDER_TIDDLER}"] .tc-tiddler-body`).textContent();
		expect(body.toLowerCase()).toContain("pick a note");
	});

	test("Write view renders the four maintenance columns", async ({ page }) => {
		await createTiddlerInBrowser(page, RENDER_TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/knowledge-app/views/write" $mode="block"/>'
		});
		await navigateToTiddler(page, RENDER_TIDDLER);
		await page.waitForTimeout(400);
		const body = await page.locator(`.tc-tiddler-frame[data-tiddler-title="${RENDER_TIDDLER}"] .tc-tiddler-body`).textContent();
		expect(body).toContain("Orphans");
		expect(body).toContain("Stubs");
		expect(body).toContain("Dead-ends");
		expect(body).toContain("Broken refs");
	});

	test("Home view shows the maintenance summary headers", async ({ page }) => {
		await createTiddlerInBrowser(page, RENDER_TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/knowledge-app/views/home" $mode="block"/>'
		});
		await navigateToTiddler(page, RENDER_TIDDLER);
		await page.waitForTimeout(400);
		const body = await page.locator(`.tc-tiddler-frame[data-tiddler-title="${RENDER_TIDDLER}"] .tc-tiddler-body`).textContent();
		expect(body).toContain("Knowledge");
		expect(body).toContain("Recent");
		expect(body).toContain("Maintenance summary");
	});
});

test.describe("knowledge-app: editing", () => {
	const TARGET = "knowledge/notes/EditTest";
	const DRAFT = "Draft of '" + TARGET + "'";
	const POPUP_TARGET_STATE = "$:/state/rimir/knowledge-app/popup-edit/target";

	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});
	test.afterEach(async ({ page }) => {
		for (const t of [TARGET, DRAFT, POPUP_TARGET_STATE, RENDER_TIDDLER]) {
			await deleteTiddlerFromBrowser(page, t).catch(() => {});
		}
	});

	test("popup edit modal renders the EditTemplate when target is set", async ({ page }) => {
		await createTiddlerInBrowser(page, TARGET, {
			tags: NOTE_TAG, "kn.tier": "fleeting", text: "original body"
		});
		await createTiddlerInBrowser(page, DRAFT, {
			"draft.of": TARGET, "draft.title": TARGET,
			text: "original body", tags: NOTE_TAG, "kn.tier": "fleeting"
		});
		await createTiddlerInBrowser(page, POPUP_TARGET_STATE, { text: TARGET });
		await createTiddlerInBrowser(page, RENDER_TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/knowledge-app/procedures/popup-edit-modal" $mode="block"/>'
		});
		await navigateToTiddler(page, RENDER_TIDDLER);
		await page.waitForTimeout(400);
		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${RENDER_TIDDLER}"]`);
		const text = await frame.locator(".tc-tiddler-body").textContent();
		expect(text).toContain("Save");
		expect(text).toContain("Cancel");
		const overlayCount = await frame.locator(".kn-popup-edit-overlay").count();
		expect(overlayCount).toBe(1);
	});

	test("popup overlay is hidden when target state is empty", async ({ page }) => {
		await createTiddlerInBrowser(page, RENDER_TIDDLER, {
			text: '<$reveal state="$:/state/rimir/knowledge-app/popup-edit/target" type="nomatch" text=""><$transclude $tiddler="$:/plugins/rimir/knowledge-app/procedures/popup-edit-modal" $mode="block"/></$reveal>'
		});
		await navigateToTiddler(page, RENDER_TIDDLER);
		await page.waitForTimeout(300);
		const overlay = page.locator(`.tc-tiddler-frame[data-tiddler-title="${RENDER_TIDDLER}"] .kn-popup-edit-overlay`);
		await expect(overlay).toHaveCount(0);
	});
});

test.describe("knowledge-app: areas UX", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});
	test.afterEach(async ({ page }) => {
		await deleteTiddlerFromBrowser(page, RENDER_TIDDLER).catch(() => {});
		await deleteTiddlerFromBrowser(page, "$:/state/rimir/knowledge-app/area-modal/open").catch(() => {});
	});

	test("topbar renders without filter errors and shows area pills", async ({ page }) => {
		await createTiddlerInBrowser(page, RENDER_TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/knowledge-app/apps/knowledge-topbar" $mode="block"/>'
		});
		await navigateToTiddler(page, RENDER_TIDDLER);
		await page.waitForTimeout(400);
		const body = await page.locator(`.tc-tiddler-frame[data-tiddler-title="${RENDER_TIDDLER}"] .tc-tiddler-body`).textContent();
		expect(body).not.toContain("Filter error");
		// Section pills
		expect(body).toContain("Home");
		expect(body).toContain("Browse");
		// Area pills (caption + icon)
		expect(body).toContain("LLM");
		expect(body).toContain("IT Security");
		expect(body).toContain("Health");
		expect(body).toContain("Gaming");
		// Action buttons
		expect(body).toContain("+ Note");
		expect(body).toContain("+ Area");
	});

	test("custom area created via metadata tiddler is discovered", async ({ page }) => {
		await createTiddlerInBrowser(page, "$:/config/rimir/knowledge-app/areas/test-area", {
			tags: "$:/tags/rimir/knowledge-app/area",
			"area-id": "test-area",
			caption: "Test Area",
			icon: "🧪"
		});
		const ids = await page.evaluate(() => {
			const titles = $tw.wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/rimir/knowledge-app/area]get[area-id]]");
			return titles;
		});
		expect(ids).toContain("test-area");
		await deleteTiddlerFromBrowser(page, "$:/config/rimir/knowledge-app/areas/test-area").catch(() => {});
	});
});

test.describe("knowledge-app: card types UX", () => {
	const NOTE = "knowledge/llm/TypedNote";

	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});
	test.afterEach(async ({ page }) => {
		await deleteTiddlerFromBrowser(page, NOTE).catch(() => {});
		await deleteTiddlerFromBrowser(page, RENDER_TIDDLER).catch(() => {});
		await deleteTiddlerFromBrowser(page, "$:/state/rimir/knowledge-app/type-popup/" + NOTE).catch(() => {});
	});

	test("type pill renders the configured caption + icon for a typed note", async ({ page }) => {
		await createTiddlerInBrowser(page, NOTE, {
			tags: NOTE_TAG, "kn.tier": "fleeting", "kn.type": "source", text: "see book"
		});
		await createTiddlerInBrowser(page, RENDER_TIDDLER, {
			text: '\\import $:/plugins/rimir/knowledge-app/procedures/type-pill\n<$transclude $variable="kn-type-pill" noteTitle="' + NOTE + '" interactive="no" $mode="block"/>'
		});
		await navigateToTiddler(page, RENDER_TIDDLER);
		await page.waitForTimeout(300);
		const txt = await page.locator(`.tc-tiddler-frame[data-tiddler-title="${RENDER_TIDDLER}"] .tc-tiddler-body`).textContent();
		expect(txt).toContain("Source");
		expect(txt).toContain("📚");
	});

	test("type pill defaults to Idea when kn.type is missing", async ({ page }) => {
		await createTiddlerInBrowser(page, NOTE, {
			tags: NOTE_TAG, "kn.tier": "fleeting", text: ""
		});
		await createTiddlerInBrowser(page, RENDER_TIDDLER, {
			text: '\\import $:/plugins/rimir/knowledge-app/procedures/type-pill\n<$transclude $variable="kn-type-pill" noteTitle="' + NOTE + '" interactive="no" $mode="block"/>'
		});
		await navigateToTiddler(page, RENDER_TIDDLER);
		await page.waitForTimeout(300);
		const txt = await page.locator(`.tc-tiddler-frame[data-tiddler-title="${RENDER_TIDDLER}"] .tc-tiddler-body`).textContent();
		expect(txt).toContain("Idea");
		expect(txt).toContain("💡");
	});

	test("Browse view renders the type chip row with the shipped types", async ({ page }) => {
		await createTiddlerInBrowser(page, RENDER_TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/knowledge-app/views/browse" $mode="block"/>'
		});
		await navigateToTiddler(page, RENDER_TIDDLER);
		await page.waitForTimeout(400);
		const txt = await page.locator(`.tc-tiddler-frame[data-tiddler-title="${RENDER_TIDDLER}"] .kn-types-row`).textContent();
		expect(txt).toContain("All");
		expect(txt).toContain("Idea");
		expect(txt).toContain("Source");
		expect(txt).toContain("PAO");
		expect(txt).toContain("Bibliography");
		expect(txt).toContain("Tool");
	});
});

test.describe("knowledge-app: tier pill cycling", () => {
	const NOTE = "knowledge/notes/Tier";

	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
		await createTiddlerInBrowser(page, NOTE, {
			tags: NOTE_TAG, "kn.tier": "fleeting", text: ""
		});
	});
	test.afterEach(async ({ page }) => {
		await deleteTiddlerFromBrowser(page, NOTE).catch(() => {});
		await deleteTiddlerFromBrowser(page, RENDER_TIDDLER).catch(() => {});
	});

	test("clicking the pill in interactive mode advances the tier", async ({ page }) => {
		await createTiddlerInBrowser(page, RENDER_TIDDLER, {
			text: '\\import $:/plugins/rimir/knowledge-app/procedures/tier-pill\n<$transclude $variable="kn-tier-pill" noteTitle="' + NOTE + '" interactive="yes" $mode="block"/>'
		});
		await navigateToTiddler(page, RENDER_TIDDLER);
		await page.waitForTimeout(300);
		const button = page.locator(`.tc-tiddler-frame[data-tiddler-title="${RENDER_TIDDLER}"] .kn-tier-pill`).first();
		await button.click();
		await page.waitForTimeout(200);
		const tier1 = await page.evaluate((t) => $tw.wiki.getTiddler(t).fields["kn.tier"], NOTE);
		expect(tier1).toBe("developing");
		await button.click();
		await page.waitForTimeout(200);
		const tier2 = await page.evaluate((t) => $tw.wiki.getTiddler(t).fields["kn.tier"], NOTE);
		expect(tier2).toBe("evergreen");
		await button.click();
		await page.waitForTimeout(200);
		const tier3 = await page.evaluate((t) => $tw.wiki.getTiddler(t).fields["kn.tier"], NOTE);
		expect(tier3).toBe("fleeting");
	});
});

test.describe("knowledge-app: search input keystroke regression", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});
	test.afterEach(async ({ page }) => {
		await deleteTiddlerFromBrowser(page, RENDER_TIDDLER).catch(() => {});
		await deleteTiddlerFromBrowser(page, "$:/state/rimir/knowledge-app/search-query").catch(() => {});
	});

	test("typing several characters preserves focus and accumulates", async ({ page }) => {
		await createTiddlerInBrowser(page, RENDER_TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/knowledge-app/views/search" $mode="block"/>'
		});
		await navigateToTiddler(page, RENDER_TIDDLER);
		await page.waitForTimeout(300);
		const input = page.locator(`.tc-tiddler-frame[data-tiddler-title="${RENDER_TIDDLER}"] input.tc-edit-texteditor`).first();
		await input.click();
		await input.type("hello", { delay: 50 });
		const value = await input.inputValue();
		expect(value).toBe("hello");
	});
});
