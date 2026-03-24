const { test, expect } = require("@playwright/test");
const { waitForTW, navigateToTiddler, createTiddlerInBrowser, deleteTiddlerFromBrowser } = require("./helpers");

const TIDDLER = "RunnerTestTiddler";

test.describe("runner plugin", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test.afterEach(async ({ page }) => {
		await deleteTiddlerFromBrowser(page, TIDDLER).catch(() => {});
	});

	test("runner API endpoint responds to valid action", async ({ request }) => {
		const response = await request.get("/api/run?action=echo&msg=hello", {
			headers: { "X-Requested-With": "TiddlyWiki" },
		});
		expect(response.ok()).toBeTruthy();
		const body = await response.text();
		expect(body).toContain("hello");
	});

	test("runner API rejects unknown action", async ({ request }) => {
		const response = await request.get("/api/run?action=nonexistent", {
			headers: { "X-Requested-With": "TiddlyWiki" },
		});
		expect(response.ok()).toBeFalsy();
	});

	test("runner API rejects missing action parameter", async ({ request }) => {
		const response = await request.get("/api/run", {
			headers: { "X-Requested-With": "TiddlyWiki" },
		});
		expect(response.ok()).toBeFalsy();
	});

	test("api.run widget renders inside button", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<$button><$api.run action="echo" msg="playwright-test"/>Run Echo</$button>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const btn = frame.locator("button").filter({ hasText: "Run Echo" });
		await expect(btn).toBeVisible();
	});

	test("showcase tiddler renders demo buttons", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/runner/showcase");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/runner/showcase"]');
		const buttons = frame.locator("button");
		const count = await buttons.count();
		expect(count).toBeGreaterThan(0);
	});
});
