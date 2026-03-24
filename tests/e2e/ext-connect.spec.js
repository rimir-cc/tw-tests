const { test, expect } = require("@playwright/test");
const { waitForTW, navigateToTiddler } = require("./helpers");

test.describe("ext-connect plugin", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test("ext-connect settings render in settings hub", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();
		// Plugin name is "ext connect" (space, not hyphen)
		await cp.locator(".rr-settings-sidebar .rr-settings-plugin-item").filter({ hasText: /ext.connect/i }).click();

		const content = cp.locator(".rr-settings-content");
		await expect(content.locator(".rr-settings-header")).toBeVisible();
	});

	test("ext-connect settings have tab navigation", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();
		await cp.locator(".rr-settings-sidebar .rr-settings-plugin-item").filter({ hasText: /ext.connect/i }).click();

		const content = cp.locator(".rr-settings-content");
		const tabs = content.locator(".rr-tab");
		const count = await tabs.count();
		expect(count).toBeGreaterThan(1);
	});

	test("ext-connect API endpoint exists", async ({ request }) => {
		const response = await request.post("/api/ext-connect/put-tiddler", {
			headers: {
				"Content-Type": "application/json",
				"X-Requested-With": "TiddlyWiki",
			},
			data: { text: "test" },
		});
		expect(response.status()).not.toBe(404);
	});

	test("POST to ext-connect creates a tiddler in the wiki", async ({ page, request }) => {
		const testTitle = "ExtConnectCreatedTiddler";
		const response = await request.post("/api/ext-connect/put-tiddler", {
			headers: {
				"Content-Type": "application/json",
				"X-Requested-With": "TiddlyWiki",
			},
			data: { text: "Created via ext-connect", title: testTitle },
		});
		expect(response.ok()).toBeTruthy();

		// Wait for syncer to pick up the new tiddler
		await page.waitForTimeout(1500);

		// Force a sync poll
		await page.evaluate(() => {
			if ($tw.syncer) $tw.syncer.syncFromServer();
		});
		await page.waitForTimeout(1500);

		// Verify tiddler exists via API
		const getResp = await request.get(`/recipes/default/tiddlers/${encodeURIComponent(testTitle)}`, {
			headers: { "X-Requested-With": "TiddlyWiki" },
		});
		expect(getResp.ok()).toBeTruthy();
		const tiddler = await getResp.json();
		expect(tiddler.text).toContain("Created via ext-connect");

		// Cleanup
		await request.delete(`/bags/default/tiddlers/${encodeURIComponent(testTitle)}`, {
			headers: { "X-Requested-With": "TiddlyWiki" },
		}).catch(() => {});
	});
});
