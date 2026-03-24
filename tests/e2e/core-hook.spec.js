const { test, expect } = require("@playwright/test");
const { waitForTW, navigateToTiddler } = require("./helpers");

test.describe("core-hook plugin", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test("settings hub renders in ControlPanel", async ({ page }) => {
		// Navigate to ControlPanel
		await navigateToTiddler(page, "$:/ControlPanel");
		// Click the Settings tab
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();

		// Click "Rimi Plugins" sub-tab
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();

		// The settings hub should render
		await expect(cp.locator(".rr-settings-hub")).toBeVisible();
		await expect(cp.locator(".rr-settings-sidebar")).toBeVisible();
		await expect(cp.locator(".rr-settings-content")).toBeVisible();
	});

	test("settings hub sidebar lists installed rimir plugins", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();

		const sidebar = cp.locator(".rr-settings-sidebar");
		// Should list multiple plugins
		const items = sidebar.locator(".rr-settings-plugin-item");
		const count = await items.count();
		expect(count).toBeGreaterThan(3);

		// Each item should have a name and version
		const firstItem = items.first();
		await expect(firstItem.locator(".rr-settings-plugin-name")).toBeVisible();
		await expect(firstItem.locator(".rr-settings-plugin-version")).toBeVisible();
	});

	test("clicking a plugin in sidebar shows its settings", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();

		// Click on minver in the sidebar
		const sidebar = cp.locator(".rr-settings-sidebar");
		await sidebar.locator(".rr-settings-plugin-item").filter({ hasText: "minver" }).click();

		// Content area should show minver's settings header
		const content = cp.locator(".rr-settings-content");
		await expect(content.locator(".rr-settings-header-name")).toContainText("minver");

		// Should show the active state on the clicked item
		await expect(sidebar.locator(".rr-settings-plugin-active")).toContainText("minver");
	});

	test("plugin without settings shows fallback info card", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();

		// Click on orga (has empty settings)
		const sidebar = cp.locator(".rr-settings-sidebar");
		await sidebar.locator(".rr-settings-plugin-item").filter({ hasText: "orga" }).first().click();

		// Should show the info card fallback
		const content = cp.locator(".rr-settings-content");
		await expect(content.locator(".rr-settings-info-card")).toBeVisible();
	});

	test("switching plugins updates content area correctly", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();

		const sidebar = cp.locator(".rr-settings-sidebar");
		const content = cp.locator(".rr-settings-content");

		// Click minver
		await sidebar.locator(".rr-settings-plugin-item").filter({ hasText: "minver" }).click();
		await expect(content.locator(".rr-settings-header-name")).toContainText("minver");

		// Switch to theme
		await sidebar.locator(".rr-settings-plugin-item").filter({ hasText: "theme" }).click();
		await expect(content.locator(".rr-settings-header-name")).toContainText("theme");
		// minver content should be gone
		await expect(content.locator(".rr-settings-header-name")).not.toContainText("minver");

		// Switch to realms
		await sidebar.locator(".rr-settings-plugin-item").filter({ hasText: "realms" }).click();
		await expect(content.locator(".rr-settings-header-name")).toContainText("realms");
	});
});
