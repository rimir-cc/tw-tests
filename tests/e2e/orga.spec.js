const { test, expect } = require("@playwright/test");
const { waitForTW, navigateToTiddler, createTiddlerInBrowser, deleteTiddlerFromBrowser } = require("./helpers");

test.describe("orga + orga-tools plugins", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test("orga plugin is loaded and has type definitions", async ({ page }) => {
		const typeCount = await page.evaluate(() => {
			return $tw.wiki.filterTiddlers("[all[shadows+tiddlers]prefix[$:/plugins/rimir/orga/typed/types/]]").length;
		});
		expect(typeCount).toBeGreaterThan(0);
	});

	test("orga field definitions are loaded", async ({ page }) => {
		const fieldCount = await page.evaluate(() => {
			return $tw.wiki.filterTiddlers("[all[shadows+tiddlers]prefix[$:/plugins/rimir/orga/typed/fields/]]").length;
		});
		expect(fieldCount).toBeGreaterThan(0);
	});

	test("orga types appear in typed spawner dropdown", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/typed/spawner");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/typed/spawner"]');
		const select = frame.locator("select").first();
		const optionTexts = await select.locator("option").allInnerTexts();

		// Should contain at least some orga types
		const orgaTypes = optionTexts.filter((t) => /project|task|team|person/i.test(t));
		expect(orgaTypes.length).toBeGreaterThan(0);
	});

	test("orga-tools plugin is loaded", async ({ page }) => {
		const loaded = await page.evaluate(() => {
			return !!$tw.wiki.getTiddler("$:/plugins/rimir/orga-tools");
		});
		expect(loaded).toBe(true);
	});

	test("orga settings render in settings hub", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();

		const sidebar = cp.locator(".rr-settings-sidebar");
		// Both orga and orga-tools should appear
		await expect(sidebar.locator(".rr-settings-plugin-item").filter({ hasText: "orga" }).first()).toBeVisible();
	});

	test("resourceplanning widget module is loaded", async ({ page }) => {
		const loaded = await page.evaluate(() => {
			// Widget is registered via exports.resourceplanning
			var types = $tw.modules.types["widget"];
			return types && !!Object.keys(types).find(function(k) { return k.indexOf("orga-tools") !== -1; });
		});
		expect(loaded).toBe(true);
	});

	test("resourceplanning widget renders SVG from JSON source", async ({ page }) => {
		// Create roadmap data and display tiddler via page.evaluate for proper JSON handling
		await page.evaluate(() => {
			var data = {
				start: "2026-01-01",
				end: "2026-06-30",
				lanes: [{
					title: "Test Lane",
					tasks: [{
						title: "Test Task",
						start: "2026-02-01",
						end: "2026-03-15",
						status: "in_progress"
					}]
				}]
			};
			$tw.wiki.addTiddler(new $tw.Tiddler({
				title: "$:/temp/test-roadmap-data",
				text: JSON.stringify(data),
				type: "application/json"
			}));
			$tw.wiki.addTiddler(new $tw.Tiddler({
				title: "OrgaToolsTestTiddler",
				text: '<$resourceplanning source="$:/temp/test-roadmap-data" width="800" height="400"/>'
			}));
		});
		await navigateToTiddler(page, "OrgaToolsTestTiddler");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="OrgaToolsTestTiddler"]');
		const svg = frame.locator('.tc-tiddler-body svg');
		await expect(svg).toBeVisible();

		// Verify SVG has content (month headers, lane labels, etc.)
		const svgContent = await svg.innerHTML();
		expect(svgContent.length).toBeGreaterThan(100);

		await deleteTiddlerFromBrowser(page, "OrgaToolsTestTiddler");
		await deleteTiddlerFromBrowser(page, "$:/temp/test-roadmap-data");
	});
});
