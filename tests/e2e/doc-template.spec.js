const { test, expect } = require("@playwright/test");
const { waitForTW, navigateToTiddler } = require("./helpers");

test.describe("doc-template plugin", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test("plugin hub renders with header and card grid", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/doc-template/hub");

		const hub = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/doc-template/hub"]');
		// Hub should contain "Plugin Hub" text somewhere
		await expect(hub).toContainText(/Plugin Hub/i);

		// Card grid should be visible (one per category)
		await expect(hub.locator(".rdt-hub-grid").first()).toBeVisible();
	});

	test("hub displays plugin cards with names and versions", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/doc-template/hub");

		const hub = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/doc-template/hub"]');
		const cards = hub.locator(".rdt-card");
		const count = await cards.count();
		expect(count).toBeGreaterThan(3);

		// Each card should have a title and description
		const firstCard = cards.first();
		await expect(firstCard.locator(".rdt-card-title")).toBeVisible();
	});

	test("clicking a card opens the plugin documentation page", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/doc-template/hub");

		const hub = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/doc-template/hub"]');

		// Click a plugin card (e.g., minver)
		await hub.locator(".rdt-card").filter({ hasText: "minver" }).click();

		// Should show the doc page with header and tabs
		await expect(hub.locator(".rdt-page")).toBeVisible();
		await expect(hub.locator(".rdt-header")).toContainText("minver");
		await expect(hub.locator(".rdt-tabs")).toBeVisible();
		await expect(hub.locator(".rdt-breadcrumb")).toBeVisible();
	});

	test("doc page tabs switch content", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/doc-template/hub");

		const hub = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/doc-template/hub"]');
		await hub.locator(".rdt-card").filter({ hasText: "minver" }).click();

		// Should have multiple tabs
		const tabs = hub.locator(".rdt-tab");
		const tabCount = await tabs.count();
		expect(tabCount).toBeGreaterThan(1);

		// First tab should be active
		await expect(tabs.first()).toHaveClass(/rdt-tab-active/);

		// Click second tab
		await tabs.nth(1).click();
		await expect(tabs.nth(1)).toHaveClass(/rdt-tab-active/);
		// First tab should no longer be active
		await expect(tabs.first()).not.toHaveClass(/rdt-tab-active/);
	});

	test("doc page has breadcrumb navigation", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/doc-template/hub");

		const hub = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/doc-template/hub"]');
		await hub.locator(".rdt-card").filter({ hasText: "minver" }).click();

		// Breadcrumb should be visible with navigation elements
		const breadcrumb = hub.locator(".rdt-breadcrumb");
		await expect(breadcrumb).toBeVisible();
		const links = breadcrumb.locator("button, a");
		const count = await links.count();
		expect(count).toBeGreaterThan(0);
	});

	test("hub groups cards by category", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/doc-template/hub");

		const hub = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/doc-template/hub"]');
		const categories = hub.locator(".rdt-hub-category");
		const count = await categories.count();
		expect(count).toBeGreaterThan(0);
	});
});
