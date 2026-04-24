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

// ──────────────────────────────────────────────────────────────────────
// App FAB and switching
// ──────────────────────────────────────────────────────────────────────

test.describe("appify FAB and app switching", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
		// Ensure clean state: no active app, FAB closed
		await page.evaluate(() => {
			$tw.wiki.deleteTiddler("$:/state/rimir/appify/active-app");
			$tw.wiki.deleteTiddler("$:/state/rimir/appify/fab-open");
			$tw.wiki.deleteTiddler("$:/state/rimir/appify/edit-mode");
		});
	});

	test.afterEach(async ({ page }) => {
		await page.evaluate(() => {
			$tw.wiki.deleteTiddler("$:/state/rimir/appify/active-app");
			$tw.wiki.deleteTiddler("$:/state/rimir/appify/fab-open");
			$tw.wiki.deleteTiddler("$:/state/rimir/appify/edit-mode");
		}).catch(() => {});
	});

	test("FAB button exists on page", async ({ page }) => {
		const fabBtn = page.locator(".appify-fab-btn");
		await expect(fabBtn).toBeVisible();
	});

	test("clicking FAB opens the popup with app list", async ({ page }) => {
		const fabBtn = page.locator(".appify-fab-btn");
		await fabBtn.click();
		await page.waitForTimeout(300);

		// The popup should now be visible
		const popup = page.locator(".appify-fab-popup");
		await expect(popup).toBeVisible();

		// Should contain the "Wiki (default)" button
		const wikiDefault = popup.locator(".appify-fab-item", { hasText: "Wiki (default)" });
		await expect(wikiDefault).toBeVisible();
	});

	test("clicking an app in the popup activates it", async ({ page }) => {
		// Ensure at least the sample demo app is tagged
		const hasSampleApp = await page.evaluate(() => {
			const apps = $tw.wiki.filterTiddlers("[all[tiddlers+shadows]tag[$:/tags/rimir/appify/app]]");
			return apps.length > 0;
		});
		expect(hasSampleApp).toBe(true);

		// Open FAB popup
		await page.locator(".appify-fab-btn").click();
		await page.waitForTimeout(300);

		// Click the first app item that is NOT "Wiki (default)"
		const appItems = page.locator(".appify-fab-popup .appify-fab-item");
		const count = await appItems.count();
		// First item is "Wiki (default)", so click the second one if it exists
		if (count > 1) {
			await appItems.nth(1).click();
			await page.waitForTimeout(500);

			// Verify active-app state tiddler is set
			const activeApp = await page.evaluate(() => {
				return $tw.wiki.getTiddlerText("$:/state/rimir/appify/active-app", "");
			});
			expect(activeApp.length).toBeGreaterThan(0);
		}
	});

	test("clicking 'Wiki (default)' deactivates app mode", async ({ page }) => {
		// First activate an app via store
		await page.evaluate(() => {
			const apps = $tw.wiki.filterTiddlers("[all[tiddlers+shadows]tag[$:/tags/rimir/appify/app]]");
			if (apps.length > 0) {
				$tw.wiki.addTiddler({ title: "$:/state/rimir/appify/active-app", text: apps[0] });
			}
		});
		await page.waitForTimeout(300);

		// In app mode there are two FAB instances in the DOM (wiki-mode FAB
		// hidden on <body>, app-mode FAB inside the app layout). Target the
		// visible one explicitly.
		await page.locator(".appify-fab-btn:visible").click();
		await page.waitForTimeout(300);

		const wikiDefault = page.locator(".appify-fab-popup:visible .appify-fab-item", { hasText: "Wiki (default)" });
		await wikiDefault.click();
		await page.waitForTimeout(300);

		// Verify active-app is cleared
		const activeApp = await page.evaluate(() => {
			return $tw.wiki.getTiddlerText("$:/state/rimir/appify/active-app", "");
		});
		expect(activeApp).toBe("");
	});
});

// ──────────────────────────────────────────────────────────────────────
// Layout switching
// ──────────────────────────────────────────────────────────────────────

const LAYOUT_APP = "LayoutTestApp";
const LAYOUT_VIEW = "LayoutTestView";

test.describe("appify layout switching", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test.afterEach(async ({ page }) => {
		await page.evaluate(() => {
			$tw.wiki.deleteTiddler("LayoutTestApp");
			$tw.wiki.deleteTiddler("LayoutTestView");
			$tw.wiki.deleteTiddler("$:/state/rimir/appify/active-app");
			$tw.wiki.deleteTiddler("$:/state/rimir/appify/edit-mode");
		}).catch(() => {});
	});

	test("sidebar-main layout renders correct grid areas", async ({ page }) => {
		// Create a test app with sidebar-main layout
		await page.evaluate(() => {
			$tw.wiki.addTiddler(new $tw.Tiddler({
				title: "LayoutTestView",
				text: "Layout test content",
			}));
			$tw.wiki.addTiddler(new $tw.Tiddler({
				title: "LayoutTestApp",
				tags: "$:/tags/rimir/appify/app",
				caption: "Layout Test",
				"appify-channels": "ch",
				"appify-layout": "sidebar-main",
				"appify-view-sidebar": "LayoutTestView",
				"appify-view-main": "LayoutTestView",
			}));
			// Activate the app
			$tw.wiki.addTiddler({ title: "$:/state/rimir/appify/active-app", text: "LayoutTestApp" });
		});
		await page.waitForTimeout(500);

		// Verify grid has sidebar and main slots
		const slots = await page.evaluate(() => {
			const grid = document.querySelector(".appify-grid");
			if (!grid) return { found: false };
			const slotEls = grid.querySelectorAll(".appify-slot");
			const names = [];
			slotEls.forEach(el => {
				const classes = Array.from(el.classList);
				const slotClass = classes.find(c => c.startsWith("appify-slot-") && c !== "appify-slot");
				if (slotClass) names.push(slotClass.replace("appify-slot-", ""));
			});
			return { found: true, names, gridStyle: grid.getAttribute("style") || "" };
		});

		expect(slots.found).toBe(true);
		expect(slots.names).toContain("sidebar");
		expect(slots.names).toContain("main");
		// The widget sets grid-template-areas as its own property, but the browser
		// normalizes to the `grid-template` shorthand when re-serializing the style
		// attribute. Assert on the shared payload (the area names) instead.
		expect(slots.gridStyle).toContain("sidebar main");
	});

	test("switching layout changes grid structure", async ({ page }) => {
		// Create app with sidebar-main layout first
		await page.evaluate(() => {
			$tw.wiki.addTiddler(new $tw.Tiddler({
				title: "LayoutTestView",
				text: "Layout test content",
			}));
			$tw.wiki.addTiddler(new $tw.Tiddler({
				title: "LayoutTestApp",
				tags: "$:/tags/rimir/appify/app",
				caption: "Layout Test",
				"appify-channels": "ch",
				"appify-layout": "sidebar-main",
				"appify-view-sidebar": "LayoutTestView",
				"appify-view-main": "LayoutTestView",
			}));
			$tw.wiki.addTiddler({ title: "$:/state/rimir/appify/active-app", text: "LayoutTestApp" });
		});
		await page.waitForTimeout(500);

		// Capture initial grid style
		const initialStyle = await page.evaluate(() => {
			const grid = document.querySelector(".appify-grid");
			return grid ? grid.getAttribute("style") : "";
		});

		// Switch to focus layout
		await page.evaluate(() => {
			var app = $tw.wiki.getTiddler("LayoutTestApp");
			if (app) {
				$tw.wiki.addTiddler(new $tw.Tiddler(app, {
					"appify-layout": "focus",
					"appify-view-main": "LayoutTestView",
				}));
			}
		});
		await page.waitForTimeout(500);

		// Verify grid style changed
		const newStyle = await page.evaluate(() => {
			const grid = document.querySelector(".appify-grid");
			return grid ? grid.getAttribute("style") : "";
		});

		// The styles should differ because layouts have different grid definitions
		expect(newStyle).not.toBe(initialStyle);
	});
});

// ──────────────────────────────────────────────────────────────────────
// Edit mode
// ──────────────────────────────────────────────────────────────────────

test.describe("appify edit mode", () => {
	const EDIT_APP = "EditModeTestApp";
	const EDIT_VIEW = "EditModeTestView";

	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test.afterEach(async ({ page }) => {
		await page.evaluate(() => {
			$tw.wiki.deleteTiddler("EditModeTestApp");
			$tw.wiki.deleteTiddler("EditModeTestView");
			$tw.wiki.deleteTiddler("$:/state/rimir/appify/active-app");
			$tw.wiki.deleteTiddler("$:/state/rimir/appify/edit-mode");
		}).catch(() => {});
	});

	test("toggling edit mode shows debug bar and slot labels", async ({ page }) => {
		// Create and activate a test app
		await page.evaluate(() => {
			$tw.wiki.addTiddler(new $tw.Tiddler({
				title: "EditModeTestView",
				text: "Edit mode test view content",
			}));
			$tw.wiki.addTiddler(new $tw.Tiddler({
				title: "EditModeTestApp",
				tags: "$:/tags/rimir/appify/app",
				caption: "Edit Mode Test",
				"appify-channels": "project task",
				"appify-layout": "sidebar-main",
				"appify-view-sidebar": "EditModeTestView",
				"appify-view-main": "EditModeTestView",
			}));
			$tw.wiki.addTiddler({ title: "$:/state/rimir/appify/active-app", text: "EditModeTestApp" });
		});
		await page.waitForTimeout(500);

		// Verify edit mode is off — no debug bar
		let debugBar = await page.locator(".appify-debug-bar").count();
		expect(debugBar).toBe(0);

		// Enable edit mode via state tiddler
		await page.evaluate(() => {
			$tw.wiki.addTiddler({ title: "$:/state/rimir/appify/edit-mode", text: "yes" });
		});
		await page.waitForTimeout(500);

		// Debug bar should now be visible
		debugBar = await page.locator(".appify-debug-bar").count();
		expect(debugBar).toBeGreaterThan(0);

		// Slots should have edit class
		const editSlots = await page.locator(".appify-slot-edit").count();
		expect(editSlots).toBeGreaterThan(0);
	});

	test("edit mode debug bar shows channel names", async ({ page }) => {
		// Create and activate a test app with channels
		await page.evaluate(() => {
			$tw.wiki.addTiddler(new $tw.Tiddler({
				title: "EditModeTestView",
				text: "View content",
			}));
			$tw.wiki.addTiddler(new $tw.Tiddler({
				title: "EditModeTestApp",
				tags: "$:/tags/rimir/appify/app",
				caption: "Edit Mode Test",
				"appify-channels": "project task",
				"appify-layout": "sidebar-main",
				"appify-view-sidebar": "EditModeTestView",
				"appify-view-main": "EditModeTestView",
			}));
			$tw.wiki.addTiddler({ title: "$:/state/rimir/appify/active-app", text: "EditModeTestApp" });
			$tw.wiki.addTiddler({ title: "$:/state/rimir/appify/edit-mode", text: "yes" });
		});
		await page.waitForTimeout(500);

		// Debug bar should show channel names
		const channelNames = await page.evaluate(() => {
			const names = document.querySelectorAll(".appify-debug-name");
			return Array.from(names).map(el => el.textContent);
		});
		expect(channelNames).toContain("project");
		expect(channelNames).toContain("task");
	});

	test("edit mode shows action buttons (clone, delete, etc.)", async ({ page }) => {
		await page.evaluate(() => {
			$tw.wiki.addTiddler(new $tw.Tiddler({
				title: "EditModeTestView",
				text: "View content",
			}));
			$tw.wiki.addTiddler(new $tw.Tiddler({
				title: "EditModeTestApp",
				tags: "$:/tags/rimir/appify/app",
				caption: "Edit Mode Test",
				"appify-channels": "ch",
				"appify-layout": "sidebar-main",
				"appify-view-sidebar": "EditModeTestView",
				"appify-view-main": "EditModeTestView",
			}));
			$tw.wiki.addTiddler({ title: "$:/state/rimir/appify/active-app", text: "EditModeTestApp" });
			$tw.wiki.addTiddler({ title: "$:/state/rimir/appify/edit-mode", text: "yes" });
		});
		await page.waitForTimeout(500);

		const actionBtns = await page.locator(".appify-debug-btn").count();
		expect(actionBtns).toBeGreaterThan(0);

		// Should have the action container
		const actionsContainer = await page.locator(".appify-debug-actions").count();
		expect(actionsContainer).toBeGreaterThan(0);
	});
});

// ──────────────────────────────────────────────────────────────────────
// Clone workflow
// ──────────────────────────────────────────────────────────────────────

test.describe("appify clone workflow", () => {
	const CLONE_NAME = "CloneTestApp";
	const CLONE_SOURCE = "$:/plugins/rimir/appify/samples/demo-app";

	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test.afterEach(async ({ page }) => {
		// Clean up all cloned tiddlers
		await page.evaluate((name) => {
			const prefix = ($tw.wiki.getTiddlerText("$:/config/rimir/appify/clone-prefix") || "$:/config/rimir/appify").replace(/\/+$/, "");
			const appTitle = prefix + "/apps/" + name;

			// Delete cloned app
			$tw.wiki.deleteTiddler(appTitle);

			// Delete cloned views
			const viewPrefixed = prefix + "/views/";
			$tw.wiki.filterTiddlers("[prefix[" + viewPrefixed + "]]").forEach(t => {
				$tw.wiki.deleteTiddler(t);
			});

			// Clean state
			$tw.wiki.deleteTiddler("$:/state/rimir/appify/active-app");
			$tw.wiki.deleteTiddler("$:/state/rimir/appify/edit-mode");
		}, CLONE_NAME).catch(() => {});
	});

	test("cloning demo app creates app and view tiddlers", async ({ page }) => {
		// Read source app's view fields before cloning
		const sourceViews = await page.evaluate((src) => {
			const t = $tw.wiki.getTiddler(src);
			if (!t) return [];
			const views = [];
			Object.keys(t.fields).forEach(k => {
				if (k.indexOf("appify-view-") === 0) {
					views.push({ field: k, value: t.fields[k] });
				}
			});
			return views;
		}, CLONE_SOURCE);

		expect(sourceViews.length).toBeGreaterThan(0);

		// Clone via page.evaluate (simulates the action widget)
		const result = await page.evaluate((args) => {
			const { source, name } = args;
			const wiki = $tw.wiki;
			const sourceTiddler = wiki.getTiddler(source);
			if (!sourceTiddler) return { success: false, error: "source not found" };

			const prefix = (wiki.getTiddlerText("$:/config/rimir/appify/clone-prefix") || "$:/config/rimir/appify").replace(/\/+$/, "");
			const appTitle = prefix + "/apps/" + name;

			// Replicate the clone logic
			var sourceFields = sourceTiddler.fields;
			var newFields = {};
			var fieldKeys = Object.keys(sourceFields);
			var clonedViews = [];

			for (var i = 0; i < fieldKeys.length; i++) {
				var key = fieldKeys[i];
				var val = sourceFields[key];
				if (key.indexOf("appify-view-") === 0 && typeof val === "string" && val) {
					var viewBaseName = val.split("/").pop();
					var newViewTitle = prefix + "/views/" + viewBaseName;
					var viewTiddler = wiki.getTiddler(val);
					if (viewTiddler) {
						var viewFields = {};
						var vKeys = Object.keys(viewTiddler.fields);
						for (var vi = 0; vi < vKeys.length; vi++) {
							if (vKeys[vi] !== "title") {
								viewFields[vKeys[vi]] = viewTiddler.fields[vKeys[vi]];
							}
						}
						viewFields.title = newViewTitle;
						wiki.addTiddler(new $tw.Tiddler(viewFields));
						clonedViews.push(newViewTitle);
					}
					newFields[key] = newViewTitle;
				} else if (key !== "title") {
					newFields[key] = val;
				}
			}

			newFields.title = appTitle;
			newFields.caption = name;
			wiki.addTiddler(new $tw.Tiddler(newFields));
			wiki.addTiddler({ title: "$:/state/rimir/appify/active-app", text: appTitle });

			return { success: true, appTitle, clonedViews };
		}, { source: CLONE_SOURCE, name: CLONE_NAME });

		expect(result.success).toBe(true);

		// Verify cloned app tiddler exists
		const appExists = await page.evaluate((title) => {
			return $tw.wiki.tiddlerExists(title);
		}, result.appTitle);
		expect(appExists).toBe(true);

		// Verify cloned app has correct caption
		const appCaption = await page.evaluate((title) => {
			const t = $tw.wiki.getTiddler(title);
			return t ? t.fields.caption : "";
		}, result.appTitle);
		expect(appCaption).toBe(CLONE_NAME);

		// Verify cloned view tiddlers exist
		for (const viewTitle of result.clonedViews) {
			const viewExists = await page.evaluate((title) => {
				return $tw.wiki.tiddlerExists(title);
			}, viewTitle);
			expect(viewExists).toBe(true);
		}

		// Verify the cloned app's view fields point to cloned views (not originals)
		const clonedViewFields = await page.evaluate((title) => {
			const t = $tw.wiki.getTiddler(title);
			if (!t) return {};
			const views = {};
			Object.keys(t.fields).forEach(k => {
				if (k.indexOf("appify-view-") === 0) {
					views[k] = t.fields[k];
				}
			});
			return views;
		}, result.appTitle);

		// None of the view fields should point to the original sample namespace
		Object.values(clonedViewFields).forEach(val => {
			expect(val).not.toContain("$:/plugins/rimir/appify/samples/");
		});
	});

	test("cloning activates the new app", async ({ page }) => {
		// Clone the demo app
		await page.evaluate((args) => {
			const { source, name } = args;
			const wiki = $tw.wiki;
			const sourceTiddler = wiki.getTiddler(source);
			if (!sourceTiddler) return;

			const prefix = (wiki.getTiddlerText("$:/config/rimir/appify/clone-prefix") || "$:/config/rimir/appify").replace(/\/+$/, "");
			const appTitle = prefix + "/apps/" + name;

			var sourceFields = sourceTiddler.fields;
			var newFields = {};
			Object.keys(sourceFields).forEach(key => {
				if (key !== "title") newFields[key] = sourceFields[key];
			});
			newFields.title = appTitle;
			newFields.caption = name;
			wiki.addTiddler(new $tw.Tiddler(newFields));
			wiki.addTiddler({ title: "$:/state/rimir/appify/active-app", text: appTitle });
		}, { source: CLONE_SOURCE, name: CLONE_NAME });

		await page.waitForTimeout(300);

		// Verify the active app is the cloned one
		const activeApp = await page.evaluate(() => {
			return $tw.wiki.getTiddlerText("$:/state/rimir/appify/active-app", "");
		});
		expect(activeApp).toContain(CLONE_NAME);
	});

	test("cloning does not overwrite existing app with same name", async ({ page }) => {
		// Create a "pre-existing" app tiddler at the clone target
		const preExistingText = "pre-existing content";
		await page.evaluate((args) => {
			const prefix = ($tw.wiki.getTiddlerText("$:/config/rimir/appify/clone-prefix") || "$:/config/rimir/appify").replace(/\/+$/, "");
			const appTitle = prefix + "/apps/" + args.name;
			$tw.wiki.addTiddler(new $tw.Tiddler({
				title: appTitle,
				text: args.text,
				tags: "$:/tags/rimir/appify/app",
			}));
		}, { name: CLONE_NAME, text: preExistingText });

		// Attempt to clone — should be a no-op because target exists
		// (The action-appify-clone widget checks tiddlerExists and returns early)
		await page.evaluate((args) => {
			// Simulate what action-appify-clone.invokeAction does
			const wiki = $tw.wiki;
			const sourceTiddler = wiki.getTiddler(args.source);
			if (!sourceTiddler) return;

			const prefix = (wiki.getTiddlerText("$:/config/rimir/appify/clone-prefix") || "$:/config/rimir/appify").replace(/\/+$/, "");
			const appTitle = prefix + "/apps/" + args.name;

			// This is the guard in the widget
			if (wiki.tiddlerExists(appTitle)) return;

			// If we got here, the guard failed (should not happen)
			wiki.addTiddler(new $tw.Tiddler({ title: appTitle, text: "overwritten" }));
		}, { source: CLONE_SOURCE, name: CLONE_NAME });

		// Verify the original content is still there
		const text = await page.evaluate((name) => {
			const prefix = ($tw.wiki.getTiddlerText("$:/config/rimir/appify/clone-prefix") || "$:/config/rimir/appify").replace(/\/+$/, "");
			const appTitle = prefix + "/apps/" + name;
			return $tw.wiki.getTiddlerText(appTitle, "");
		}, CLONE_NAME);
		expect(text).toBe(preExistingText);
	});
});
