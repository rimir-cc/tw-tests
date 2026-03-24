const { test, expect } = require("@playwright/test");
const { waitForTW, navigateToTiddler } = require("./helpers");

test.describe("explide plugin", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test("explide plugin is loaded", async ({ page }) => {
		const loaded = await page.evaluate(() => {
			return !!$tw.wiki.getTiddler("$:/plugins/rimir/explide");
		});
		expect(loaded).toBe(true);
	});

	test("example tiddlers exist as shadow tiddlers", async ({ page }) => {
		const examples = await page.evaluate(() => {
			return $tw.wiki.filterTiddlers("[all[shadows]prefix[$:/plugins/rimir/explide/examples/]]");
		});
		expect(examples.length).toBeGreaterThan(0);
	});

	test("callout sandbox example renders in story", async ({ page }) => {
		// Check tiddler exists first
		const exists = await page.evaluate(() => {
			return !!$tw.wiki.getTiddler("$:/plugins/rimir/explide/examples/callout-sandbox");
		});
		expect(exists).toBe(true);

		await navigateToTiddler(page, "$:/plugins/rimir/explide/examples/callout-sandbox");
		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/explide/examples/callout-sandbox"]');
		await expect(frame).toBeVisible({ timeout: 10000 });
	});

	test("mini-app example renders in story", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/explide/examples/mini-app");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/explide/examples/mini-app"]');
		await expect(frame).toBeVisible();
	});

	test("explide settings render in settings hub", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();
		await cp.locator(".rr-settings-sidebar .rr-settings-plugin-item").filter({ hasText: "explide" }).click();

		const content = cp.locator(".rr-settings-content");
		await expect(content.locator(".rr-settings-header")).toBeVisible();
	});
});
