const { test, expect } = require("@playwright/test");
const { waitForTW, navigateToTiddler } = require("./helpers");

test.describe("typed plugin", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test("spawner tab renders with type dropdown", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/typed/spawner");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/typed/spawner"]');
		await expect(frame).toBeVisible();

		// Should have a select/dropdown for type selection
		const select = frame.locator("select").first();
		await expect(select).toBeVisible();
	});

	test("spawner shows fields when type is selected", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/typed/spawner");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/typed/spawner"]');
		const select = frame.locator("select").first();

		// Select a type (get first non-placeholder option)
		const options = select.locator("option");
		const optionCount = await options.count();
		if (optionCount > 1) {
			const value = await options.nth(1).getAttribute("value");
			await select.selectOption(value);

			// Should show field editors after selection
			// Wait a moment for dynamic rendering
			await page.waitForTimeout(300);
			const inputs = frame.locator("input, textarea, select");
			const inputCount = await inputs.count();
			// Should have more than just the type selector
			expect(inputCount).toBeGreaterThan(1);
		}
	});

	test("validator tab renders", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/typed/validator");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/typed/validator"]');
		await expect(frame).toBeVisible();
	});

	test("typed settings render in settings hub", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();
		await cp.locator(".rr-settings-sidebar .rr-settings-plugin-item").filter({ hasText: "typed" }).click();

		const content = cp.locator(".rr-settings-content");
		await expect(content.locator(".rr-settings-header-name")).toContainText("typed");
	});
});
