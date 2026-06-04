const { test, expect } = require("@playwright/test");
const {
	waitForTW, openPalette, closePaletteIfOpen,
} = require("./helpers");

/**
 * cascade-palette Structure strip (cp-views / cp-view-editor). The strip
 * exposes the active view's composition as editable pills (VIEW / LAYER /
 * SORT / + layer …). Here we assert it renders and tracks the active view.
 *
 * E2E-LIMIT: entering edit-mode on a config filter (Enter must edit the
 * facet, NOT fire the hidden menu row) and committing a scratchpad edit
 * Save-as-new vs Overwrite are driven through the edit-mode text path,
 * awkward to exercise reliably via dispatched keyboard events. Those are
 * covered by Jasmine: test-view-editor.js (scratchpad isolation + commit
 * modes + pill→field descriptors) and test-keyboard-dispatch.js
 * (enterFiresSelection("viewconfig") === false — Enter delegates, never
 * fires).
 */

test.describe.configure({ mode: "serial" });

test.describe("cascade-palette structure strip", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});
	test.afterEach(async ({ page }) => {
		await closePaletteIfOpen(page);
	});

	test("renders view-config pills for the active view", async ({ page }) => {
		await openPalette(page);
		const strip = page.locator(".rcp-view-config-strip");
		await expect(strip).toBeAttached();
		await expect(
			strip.locator(".rcp-view-config-pill", { hasText: "VIEW" }).first()
		).toBeVisible();
		await expect(
			strip.locator(".rcp-view-config-pill", { hasText: "SORT" }).first()
		).toBeVisible();
		// At least one pill is marked editable (carries an _edit descriptor).
		expect(
			await strip.locator(".rcp-view-config-pill-editable").count()
		).toBeGreaterThan(0);
	});

	test("switching views re-renders the structure strip", async ({ page }) => {
		await openPalette(page);
		// Switch to All tiddlers (a single implicit-layer view).
		await page.locator(".rcp-view-strip .rcp-view-pill", { hasText: "All tiddlers" })
			.first().click();
		await page.waitForTimeout(150);
		const strip = page.locator(".rcp-view-config-strip");
		await expect(
			strip.locator(".rcp-view-config-pill", { hasText: "VIEW" }).first()
		).toBeVisible();
		// The active view pill reflects the switch.
		await expect(
			page.locator(".rcp-view-strip .rcp-view-pill-active", { hasText: "All tiddlers" })
		).toBeVisible();
	});
});
