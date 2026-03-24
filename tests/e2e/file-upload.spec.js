const { test, expect } = require("@playwright/test");
const { waitForTW, createTiddler, deleteTiddler, navigateToTiddler, createTiddlerInBrowser } = require("./helpers");

const TIDDLER = "FileUploadTestTiddler";

test.describe("file-upload plugin", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test.afterEach(async ({ request }) => {
		await deleteTiddler(request, TIDDLER).catch(() => {});
	});

	test("file-upload settings render in settings hub", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();

		// Plugin name in sidebar is "file upload" (lowercase from plugin.info)
		await cp.locator(".rr-settings-sidebar .rr-settings-plugin-item").filter({ hasText: /file.upload/i }).click();

		const content = cp.locator(".rr-settings-content");
		await expect(content.locator(".rr-settings-header")).toBeVisible();
	});

	test("thumbnail toggle settings are interactive", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();
		await cp.locator(".rr-settings-sidebar .rr-settings-plugin-item").filter({ hasText: /file.upload/i }).click();

		const content = cp.locator(".rr-settings-content");
		const checkboxes = content.locator("input[type='checkbox']");
		const count = await checkboxes.count();
		expect(count).toBeGreaterThan(0);
	});

	test("tiddler with _thumbnail_uri renders", async ({ page }) => {
		// Enable thumbnail rendering via browser store
		await createTiddlerInBrowser(page, "$:/config/rimir/file-upload/thumb-rendering", { text: "yes" });

		await createTiddlerInBrowser(page, TIDDLER, {
			text: "",
			_canonical_uri: "/files/test.png",
			_thumbnail_uri: "/files/_generated/test_thumb.png",
			type: "image/png",
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		await expect(frame).toBeVisible();
	});

	test("upload API endpoint exists", async ({ request }) => {
		const response = await request.post("/api/file-upload", {
			headers: {
				"Content-Type": "application/json",
				"X-Requested-With": "TiddlyWiki",
			},
			data: {},
		});
		expect(response.status()).not.toBe(404);
	});
});
