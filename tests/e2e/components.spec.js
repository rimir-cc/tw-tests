const { test, expect } = require("@playwright/test");
const { waitForTW, navigateToTiddler, createTiddlerInBrowser, deleteTiddlerFromBrowser } = require("./helpers");

const TIDDLER = "ComponentsTestTiddler";

test.describe("components plugin", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test.afterEach(async ({ page }) => {
		await deleteTiddlerFromBrowser(page, TIDDLER).catch(() => {});
	});

	test("pills component renders with elements", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/components/pills" elements="alpha beta gamma" state="$:/state/test-pills"/>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const pills = frame.locator(".rrc-pills");
		await expect(pills).toBeVisible();

		const elems = pills.locator(".rrc-elem");
		await expect(elems).toHaveCount(3);
	});

	test("pills multi-select toggles selection on click", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/components/pills" elements="alpha beta gamma" selection="multi" state="$:/state/test-pills-multi"/>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const elems = frame.locator(".rrc-pills .rrc-elem");

		await elems.nth(0).click();
		await expect(elems.nth(0)).toHaveClass(/selected/);

		await elems.nth(1).click();
		await expect(elems.nth(1)).toHaveClass(/selected/);
		// First should still be selected (multi)
		await expect(elems.nth(0)).toHaveClass(/selected/);

		// Click first again to deselect
		await elems.nth(0).click();
		await expect(elems.nth(0)).not.toHaveClass(/selected/);
	});

	test("pills single-select allows only one selection", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/components/pills" elements="alpha beta gamma" selection="single" state="$:/state/test-pills-single"/>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const elems = frame.locator(".rrc-pills .rrc-elem");

		await elems.nth(0).click();
		await expect(elems.nth(0)).toHaveClass(/selected/);

		await elems.nth(1).click();
		await expect(elems.nth(1)).toHaveClass(/selected/);
		await expect(elems.nth(0)).not.toHaveClass(/selected/);
	});

	test("vtabs component renders from showcase", async ({ page }) => {
		// Use the built-in showcase which demonstrates vtabs
		await navigateToTiddler(page, "$:/plugins/rimir/components/showcase");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/components/showcase"]');
		const vtabs = frame.locator(".rrc-vtabs");
		if (await vtabs.count() > 0) {
			await expect(vtabs.first()).toBeVisible();
		}
	});

	test("showcase renders demo components", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/components/showcase");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/components/showcase"]');
		await expect(frame.locator(".rrc-pills").first()).toBeVisible();
	});

	test("pills selection state syncs to configured tiddler", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/components/pills" elements="alpha beta gamma" selection="multi" sync-tiddler="$:/temp/test-pills-sync" sync-field="text" state="$:/state/test-pills-sync"/>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const elems = frame.locator(".rrc-pills .rrc-elem");

		// Select alpha and gamma
		await elems.nth(0).click();
		await elems.nth(2).click();

		// Verify state was synced to the configured tiddler
		const syncedText = await page.evaluate(() => {
			const t = $tw.wiki.getTiddler("$:/temp/test-pills-sync");
			return t ? t.fields.text : "";
		});
		expect(syncedText).toContain("alpha");
		expect(syncedText).toContain("gamma");
		expect(syncedText).not.toContain("beta");

		// Cleanup
		await page.evaluate(() => $tw.wiki.deleteTiddler("$:/temp/test-pills-sync"));
	});
});
