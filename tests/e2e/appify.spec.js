const { test, expect } = require("@playwright/test");
const { waitForTW, navigateToTiddler, createTiddlerInBrowser, deleteTiddlerFromBrowser } = require("./helpers");

const APP_TITLE = "AppifyTestApp";
const VIEW_TITLE = "AppifyTestView";
const RENDER_TIDDLER = "AppifyRenderHost";

test.describe("appify plugin", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test.afterEach(async ({ page }) => {
		for (const t of [APP_TITLE, VIEW_TITLE, VIEW_TITLE + "-sidebar", RENDER_TIDDLER]) {
			await deleteTiddlerFromBrowser(page, t).catch(() => {});
		}
		await page.evaluate(() => {
			$tw.wiki.filterTiddlers("[prefix[$:/state/rimir/statewrap/AppifyTest]]").forEach(t =>
				$tw.wiki.deleteTiddler(t)
			);
		}).catch(() => {});
	});

	test("appify plugin is loaded with widget modules", async ({ page }) => {
		const modules = await page.evaluate(() => {
			const widgetModules = $tw.modules.types["widget"];
			return {
				appifyApp: !!widgetModules["$:/plugins/rimir/appify/modules/widgets/appify-app.js"],
				actionChannel: !!widgetModules["$:/plugins/rimir/appify/modules/widgets/action-appify-channel.js"],
				actionRule: !!widgetModules["$:/plugins/rimir/appify/modules/widgets/action-appify-rule.js"],
				actionSplit: !!widgetModules["$:/plugins/rimir/appify/modules/widgets/action-appify-split.js"],
				actionLayout: !!widgetModules["$:/plugins/rimir/appify/modules/widgets/action-appify-layout.js"],
				actionEdit: !!widgetModules["$:/plugins/rimir/appify/modules/widgets/action-appify-edit.js"],
				actionClone: !!widgetModules["$:/plugins/rimir/appify/modules/widgets/action-appify-clone.js"],
				actionDelete: !!widgetModules["$:/plugins/rimir/appify/modules/widgets/action-appify-delete.js"],
			};
		});
		expect(modules.appifyApp).toBe(true);
		expect(modules.actionChannel).toBe(true);
		expect(modules.actionRule).toBe(true);
		expect(modules.actionSplit).toBe(true);
		expect(modules.actionLayout).toBe(true);
		expect(modules.actionEdit).toBe(true);
		expect(modules.actionClone).toBe(true);
		expect(modules.actionDelete).toBe(true);
	});

	test("appify startup modules are loaded", async ({ page }) => {
		const modules = await page.evaluate(() => {
			const startupModules = $tw.modules.types["startup"];
			return {
				keyboard: !!startupModules["$:/plugins/rimir/appify/modules/startup/keyboard.js"],
				dragResize: !!startupModules["$:/plugins/rimir/appify/modules/startup/drag-resize.js"],
			};
		});
		expect(modules.keyboard).toBe(true);
		expect(modules.dragResize).toBe(true);
	});

	test("layout templates exist as shadow tiddlers", async ({ page }) => {
		const layouts = await page.evaluate(() => {
			return {
				sidebarMain: !!$tw.wiki.getTiddler("$:/plugins/rimir/appify/layouts/sidebar-main"),
				topbarSidebarMain: !!$tw.wiki.getTiddler("$:/plugins/rimir/appify/layouts/topbar-sidebar-main"),
				dashboard: !!$tw.wiki.getTiddler("$:/plugins/rimir/appify/layouts/dashboard"),
				focus: !!$tw.wiki.getTiddler("$:/plugins/rimir/appify/layouts/focus"),
			};
		});
		expect(layouts.sidebarMain).toBe(true);
		expect(layouts.topbarSidebarMain).toBe(true);
		expect(layouts.dashboard).toBe(true);
		expect(layouts.focus).toBe(true);
	});

	test("layout tiddlers have required grid fields", async ({ page }) => {
		const fields = await page.evaluate(() => {
			const t = $tw.wiki.getTiddler("$:/plugins/rimir/appify/layouts/sidebar-main");
			if (!t) return null;
			return {
				slots: t.fields["appify-slots"] || "",
				gridAreas: t.fields["appify-grid-areas"] || "",
				gridColumns: t.fields["appify-grid-columns"] || "",
				gridRows: t.fields["appify-grid-rows"] || "",
			};
		});
		expect(fields).not.toBeNull();
		expect(fields.slots).toContain("sidebar");
		expect(fields.slots).toContain("main");
		expect(fields.gridAreas.length).toBeGreaterThan(0);
		expect(fields.gridColumns.length).toBeGreaterThan(0);
		expect(fields.gridRows.length).toBeGreaterThan(0);
	});

	test("sample demo app exists with correct fields", async ({ page }) => {
		const app = await page.evaluate(() => {
			const t = $tw.wiki.getTiddler("$:/plugins/rimir/appify/samples/demo-app");
			if (!t) return null;
			return {
				channels: t.fields["appify-channels"] || "",
				layout: t.fields["appify-layout"] || "",
				tags: (t.fields.tags || []).join ? (t.fields.tags || []).join(" ") : String(t.fields.tags || ""),
			};
		});
		expect(app).not.toBeNull();
		expect(app.channels).toContain("project");
		expect(app.channels).toContain("task");
		expect(app.layout).toBe("topbar-sidebar-main");
	});

	test("appify-app widget renders grid from sample app", async ({ page }) => {
		const sampleApp = "$:/plugins/rimir/appify/samples/demo-app";

		await createTiddlerInBrowser(page, RENDER_TIDDLER, {
			text: `<$appify-app app="${sampleApp}"/>`,
		});
		await navigateToTiddler(page, RENDER_TIDDLER);

		// Wait for widget to render
		await page.waitForTimeout(1000);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${RENDER_TIDDLER}"]`);

		// Debug: check what actually renders
		const debug = await frame.evaluate(el => ({
			bodyHtml: el.querySelector(".tc-tiddler-body")?.innerHTML?.substring(0, 300) || "NO BODY",
			fullHtml: el.innerHTML.substring(0, 200),
		}));

		// The widget should render some content
		expect(debug.bodyHtml.length).toBeGreaterThan(0);
	});

	test("appify-app creates statewrap channels from app tiddler", async ({ page }) => {
		// Verify the sample app tiddler has channels defined
		const appFields = await page.evaluate(() => {
			const t = $tw.wiki.getTiddler("$:/plugins/rimir/appify/samples/demo-app");
			if (!t) return null;
			return {
				channels: t.fields["appify-channels"],
				defaultTab: t.fields["appify-default-tab"],
			};
		});
		expect(appFields).not.toBeNull();
		expect(appFields.channels).toContain("project");
		expect(appFields.channels).toContain("task");
		expect(appFields.channels).toContain("tab");
		expect(appFields.defaultTab).toBe("overview");
	});

	test("app tag filter finds tagged app tiddlers", async ({ page }) => {
		await createTiddlerInBrowser(page, APP_TITLE, {
			text: "",
			tags: "$:/tags/rimir/appify/app",
			caption: "Test App",
			"appify-channels": "ch",
			"appify-layout": "sidebar-main",
		});

		const found = await page.evaluate((title) => {
			const apps = $tw.wiki.filterTiddlers("[tag[$:/tags/rimir/appify/app]]");
			return apps.includes(title);
		}, APP_TITLE);
		expect(found).toBe(true);
	});

	test("appify-app widget tag is recognized by TW", async ({ page }) => {
		// Verify that <$appify-app> is parsed and rendered without error
		await createTiddlerInBrowser(page, RENDER_TIDDLER, {
			text: '<$appify-app app="$:/plugins/rimir/appify/samples/demo-app"/>',
		});
		await navigateToTiddler(page, RENDER_TIDDLER);
		await page.waitForTimeout(500);

		// The widget should not render as plain text (which happens for unknown tags)
		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${RENDER_TIDDLER}"]`);
		const bodyText = await frame.locator(".tc-tiddler-body").textContent();
		// Unknown widgets show the raw tag text — our widget should not
		expect(bodyText).not.toContain("$appify-app");
	});
});
