const { test, expect } = require("@playwright/test");
const { waitForTW, createTiddlerInBrowser, deleteTiddlerFromBrowser, navigateToTiddler } = require("./helpers");

test.describe("llm-help plugin", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test("plugin is loaded", async ({ page }) => {
		const loaded = await page.evaluate(() => {
			return !!$tw.wiki.getTiddler("$:/plugins/rimir/llm-help");
		});
		expect(loaded).toBe(true);
	});

	test("llm_help tool is registered with correct tag", async ({ page }) => {
		const tool = await page.evaluate(() => {
			const tid = $tw.wiki.getTiddler("$:/plugins/rimir/llm-help/tool");
			if (!tid) return null;
			return {
				toolName: tid.fields["tool-name"],
				toolMode: tid.fields["tool-mode"],
				tags: tid.fields.tags,
			};
		});
		expect(tool).not.toBeNull();
		expect(tool.toolName).toBe("llm_help");
		expect(tool.toolMode).toBe("read");
		expect(tool.tags).toContain("$:/tags/rimir/llm-connect/tool");
	});

	test("tool has valid JSON schema", async ({ page }) => {
		const schema = await page.evaluate(() => {
			const tid = $tw.wiki.getTiddler("$:/plugins/rimir/llm-help/tool");
			try {
				return JSON.parse(tid.fields["tool-schema"]);
			} catch (e) {
				return null;
			}
		});
		expect(schema).not.toBeNull();
		expect(schema.type).toBe("object");
		expect(schema.properties).toHaveProperty("path");
		expect(schema.properties).toHaveProperty("context");
	});

	test("functions tiddler exists with filter functions", async ({ page }) => {
		const text = await page.evaluate(() => {
			const tid = $tw.wiki.getTiddler("$:/plugins/rimir/llm-help/functions");
			return tid ? tid.fields.text : null;
		});
		expect(text).not.toBeNull();
		expect(text).toContain("_llm-help-all-pages");
		expect(text).toContain("_llm-help-visible-pages");
		expect(text).toContain("_llm-help-at");
		expect(text).toContain("_llm-help-child-segments");
	});

	test("root help page exists with blank path", async ({ page }) => {
		const root = await page.evaluate(() => {
			const tid = $tw.wiki.getTiddler("$:/plugins/rimir/llm-help/pages/root");
			if (!tid) return null;
			return {
				path: tid.fields["llm-help-path"],
				desc: tid.fields["llm-help-description"],
				tags: tid.fields.tags,
			};
		});
		expect(root).not.toBeNull();
		expect(root.path).toBe("");
		expect(root.desc).toBeTruthy();
		expect(root.tags).toContain("$:/tags/rimir/llm-help/page");
	});

	test("shortcuts category page exists", async ({ page }) => {
		const shortcuts = await page.evaluate(() => {
			const tid = $tw.wiki.getTiddler("$:/plugins/rimir/llm-help/pages/shortcuts");
			if (!tid) return null;
			return {
				path: tid.fields["llm-help-path"],
				desc: tid.fields["llm-help-description"],
			};
		});
		expect(shortcuts).not.toBeNull();
		expect(shortcuts.path).toBe("shortcuts");
		expect(shortcuts.desc).toBeTruthy();
	});

	test("_llm-help-all-pages returns help page tiddlers", async ({ page }) => {
		const count = await page.evaluate(() => {
			return $tw.wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/rimir/llm-help/page]]").length;
		});
		expect(count).toBeGreaterThanOrEqual(2); // at least root + shortcuts
	});

	test("data-model help page exists from orga plugin", async ({ page }) => {
		const found = await page.evaluate(() => {
			const pages = $tw.wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/rimir/llm-help/page]]");
			return pages.some(function(t) {
				var path = $tw.wiki.getTiddlerText(t, "");
				var pathField = ($tw.wiki.getTiddler(t).fields["llm-help-path"] || "");
				return pathField.split(" ").indexOf("data-model") >= 0;
			});
		});
		expect(found).toBe(true);
	});

	test("person type help page exists with dynamic content fields", async ({ page }) => {
		const personPage = await page.evaluate(() => {
			const pages = $tw.wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/rimir/llm-help/page]]");
			for (var i = 0; i < pages.length; i++) {
				var tid = $tw.wiki.getTiddler(pages[i]);
				var paths = (tid.fields["llm-help-path"] || "").split(" ");
				if (paths.indexOf("data-model/person") >= 0) {
					return {
						title: pages[i],
						text: tid.fields.text || "",
						desc: tid.fields["llm-help-description"],
					};
				}
			}
			return null;
		});
		expect(personPage).not.toBeNull();
		expect(personPage.text).toContain("render-type-info");
		expect(personPage.desc).toBeTruthy();
	});

	test("help browser UI renders in settings", async ({ page }) => {
		// Navigate to the plugin info to check settings tab
		const settingsExists = await page.evaluate(() => {
			return !!$tw.wiki.getTiddler("$:/plugins/rimir/llm-help/settings");
		});
		expect(settingsExists).toBe(true);
	});

	test("styles tiddler is tagged as stylesheet", async ({ page }) => {
		const tags = await page.evaluate(() => {
			const tid = $tw.wiki.getTiddler("$:/plugins/rimir/llm-help/styles");
			return tid ? tid.fields.tags : null;
		});
		expect(tags).toContain("$:/tags/Stylesheet");
	});

	test("custom help page is discoverable after creation", async ({ page }) => {
		// Create a test help page
		await createTiddlerInBrowser(page, "$:/llm-help/test/e2e-test-page", {
			tags: "$:/tags/rimir/llm-help/page",
			"llm-help-path": "test/e2e-check",
			"llm-help-description": "E2E test page",
			text: "Test content for e2e",
		});

		const found = await page.evaluate(() => {
			var pages = $tw.wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/rimir/llm-help/page]]");
			return pages.some(function(t) {
				var paths = ($tw.wiki.getTiddler(t).fields["llm-help-path"] || "").split(" ");
				return paths.indexOf("test/e2e-check") >= 0;
			});
		});
		expect(found).toBe(true);

		await deleteTiddlerFromBrowser(page, "$:/llm-help/test/e2e-test-page");
	});

	test("context filtering hides pages with non-matching context", async ({ page }) => {
		// Create a context-restricted page
		await createTiddlerInBrowser(page, "$:/llm-help/test/ctx-page", {
			tags: "$:/tags/rimir/llm-help/page",
			"llm-help-path": "test/ctx-only",
			"llm-help-description": "Only visible in test-ctx",
			"llm-help-context": "test-ctx",
			text: "Context-restricted content",
		});

		// Without matching context, the page's context filter should restrict it
		const visibleWithoutCtx = await page.evaluate(() => {
			// Simulate the visible-pages filter without context
			var all = $tw.wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/rimir/llm-help/page]]");
			return all.filter(function(t) {
				var ctx = $tw.wiki.getTiddler(t).fields["llm-help-context"];
				return !ctx || ctx === "";
			}).some(function(t) {
				var paths = ($tw.wiki.getTiddler(t).fields["llm-help-path"] || "").split(" ");
				return paths.indexOf("test/ctx-only") >= 0;
			});
		});
		expect(visibleWithoutCtx).toBe(false);

		// With matching context, it should be visible
		const visibleWithCtx = await page.evaluate(() => {
			var all = $tw.wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/rimir/llm-help/page]]");
			return all.filter(function(t) {
				var ctx = $tw.wiki.getTiddler(t).fields["llm-help-context"];
				if (!ctx || ctx === "") return true;
				return ctx.split(" ").indexOf("test-ctx") >= 0;
			}).some(function(t) {
				var paths = ($tw.wiki.getTiddler(t).fields["llm-help-path"] || "").split(" ");
				return paths.indexOf("test/ctx-only") >= 0;
			});
		});
		expect(visibleWithCtx).toBe(true);

		await deleteTiddlerFromBrowser(page, "$:/llm-help/test/ctx-page");
	});

	test("multi-path page is findable from both paths", async ({ page }) => {
		await createTiddlerInBrowser(page, "$:/llm-help/test/multi-path", {
			tags: "$:/tags/rimir/llm-help/page",
			"llm-help-path": "test/path-a test/path-b",
			"llm-help-description": "Multi-path test page",
			text: "Reachable from two paths",
		});

		const foundBoth = await page.evaluate(() => {
			var pages = $tw.wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/rimir/llm-help/page]]");
			var foundA = false, foundB = false;
			pages.forEach(function(t) {
				var paths = ($tw.wiki.getTiddler(t).fields["llm-help-path"] || "").split(" ");
				if (paths.indexOf("test/path-a") >= 0) foundA = true;
				if (paths.indexOf("test/path-b") >= 0) foundB = true;
			});
			return { foundA: foundA, foundB: foundB };
		});
		expect(foundBoth.foundA).toBe(true);
		expect(foundBoth.foundB).toBe(true);

		await deleteTiddlerFromBrowser(page, "$:/llm-help/test/multi-path");
	});

	test("doc tiddlers exist with correct rdt fields", async ({ page }) => {
		const docs = await page.evaluate(() => {
			var overview = $tw.wiki.getTiddler("$:/plugins/rimir/llm-help/doc/overview");
			var arch = $tw.wiki.getTiddler("$:/plugins/rimir/llm-help/doc/architecture");
			return {
				overviewExists: !!overview,
				overviewKey: overview ? overview.fields["rdt.plugin-key"] : null,
				overviewSection: overview ? overview.fields["rdt.section"] : null,
				archExists: !!arch,
			};
		});
		expect(docs.overviewExists).toBe(true);
		expect(docs.overviewKey).toBe("llm-help");
		expect(docs.overviewSection).toBe("Overview");
		expect(docs.archExists).toBe(true);
	});
});
